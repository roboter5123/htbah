import {
    onManageActiveEffect, prepareActiveEffectCategories,
} from '../helpers/effects.mjs';

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class HowToBeAHeroActorSheet extends ActorSheet {
    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['how-to-be-a-hero', 'sheet', 'actor'], width: 600, height: 600, tabs: [{
                navSelector: '.sheet-tabs', contentSelector: '.sheet-body', initial: 'skills',
            },],
        });
    }

    /** @override */
    get template() {
        return `systems/how-to-be-a-hero/templates/actor/actor-${this.actor.type}-sheet.hbs`;
    }

    /* -------------------------------------------- */

    /** @override */
    async getData() {
        // Retrieve the data structure from the base sheet. You can inspect or log
        // the context variable to see the structure, but some key properties for
        // sheets are the actor object, the data object, whether or not it's
        // editable, the items array, and the effects array.
        const context = super.getData();

        // Use a safe clone of the actor data for further operations.
        const actorData = this.document.toObject(false);

        // Add the actor's data to context.data for easier access, as well as flags.
        context.system = actorData.system;
        context.flags = actorData.flags;

        // Adding a pointer to CONFIG.HOW_TO_BE_A_HERO
        context.config = CONFIG.HOW_TO_BE_A_HERO;

        // Prepare character data and items.
        if (actorData.type == 'character') {
            this._prepareItems(context);
            this._prepareCharacterData(context);
        }

        // Prepare NPC data and items.
        if (actorData.type == 'npc') {
            this._prepareItems(context);
        }

        // Enrich biography info for display
        // Enrichment turns text like `[[/r 1d20]]` into buttons
        context.enrichedBiography = await TextEditor.enrichHTML(this.actor.system.biography, {
            // Whether to show secret blocks in the finished html
            secrets: this.document.isOwner, // Necessary in v11, can be removed in v12
            async: true, // Data to fill in for inline rolls
            rollData: this.actor.getRollData(), // Relative UUID resolution
            relativeTo: this.actor,
        });

        // Prepare active effects
        context.effects = prepareActiveEffectCategories(// A generator that returns all effects stored on the actor
            // as well as any items
            this.actor.allApplicableEffects());

        return context;
    }

    /**
     * Character-specific context modifications
     *
     * @param {object} context The context object to mutate
     */
    _prepareCharacterData(context) {
        // This is where you can enrich character-specific editor fields
        // or setup anything else that's specific to this type
        const skills = context.skillSets
        console.log(context);
        for (let [key, skillSet] of Object.entries(skills)) {
            skillSet.value = 0;
            for (const skill of skillSet.skills) {
                skillSet.value += skill.system.baseValue
            }
            skillSet.value = skillSet.value / 10;
            skillSet.eureka.max = skillSet.value / 10
            for (const skill of skillSet.skills) {
                skill.system.value = skill.system.baseValue + skillSet.value;
            }
        }
    }

    /**
     * Organize and classify Items for Actor sheets.
     *
     * @param {object} context The context object to mutate
     */
    _prepareItems(context) {
        // Initialize containers.
        const items = [];
        const skillSets = {
            "actions": {"value": 0, "eureka": {"max": 0}, "skills": []},
            "knowledge": {"value": 0, "eureka": {"max": 0}, "skills": []},
            "social": {"value": 0, "eureka": {"max": 0}, "skills": []}
        };

        // Iterate through items, allocating to containers
        for (let i of context.items) {
            i.img = i.img || Item.DEFAULT_ICON;
            // Append to items.
            if (i.type === 'item') {
                items.push(i);
            }
            // Append to correct skillSet.
            else if (i.type === 'skill') {
                skillSets[i.system.skillset].skills.push(i);
            }
        }

        // Assign and return
        context.allItems = context.items
        context.items = items;
        context.skillSets = skillSets;
    }

    /* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Render the item sheet for viewing/editing prior to the editable check.
        html.on('click', '.item-edit', (ev) => {
            const li = $(ev.currentTarget).parents('.item');
            const item = this.actor.items.get(li.data('itemId'));
            item.sheet.render(true);
        });

        // -------------------------------------------------------------
        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        // Add Inventory Item
        html.on('click', '.item-create', this._onItemCreate.bind(this));

        // Delete Inventory Item
        html.on('click', '.item-delete', (ev) => {
            const li = $(ev.currentTarget).parents('.item');
            const item = this.actor.items.get(li.data('itemId'));
            item.delete();
            li.slideUp(200, () => this.render(false));
        });

        // Active Effect management
        html.on('click', '.effect-control', (ev) => {
            const row = ev.currentTarget.closest('li');
            const document = row.dataset.parentId === this.actor.id ? this.actor : this.actor.items.get(row.dataset.parentId);
            onManageActiveEffect(ev, document);
        });

        // Rollable abilities.
        html.on('click', '.rollable', this._onRoll.bind(this));

        // Drag events for macros.
        if (this.actor.isOwner) {
            let handler = (ev) => this._onDragStart(ev);
            html.find('li.item').each((i, li) => {
                if (li.classList.contains('inventory-header')) return;
                li.setAttribute('draggable', true);
                li.addEventListener('dragstart', handler, false);
            });
        }
    }

    /**
     * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
     * @param {Event} event   The originating click event
     * @private
     */
    async _onItemCreate(event) {
        event.preventDefault();
        console.log(event)
        const header = event.currentTarget;
        // Get the type of item to create.
        const type = header.dataset.type;
        // Grab any data associated with this control.
        const data = duplicate(header.dataset);
        // Initialize a default name.
        const name = `New ${type.capitalize()}`;
        // Prepare the item object.
        const itemData = {
            name: name, type: type, system: data
        };
        // Remove the type from the dataset since it's in the itemData.type prop.
        delete itemData.system['type'];

        // Finally, create the item!
        return await Item.create(itemData, {parent: this.actor});
    }

    /**
     * Handle clickable rolls.
     * @param {Event} event   The originating click event
     * @private
     */
    _onRoll(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;

        // Handle item rolls.
        if (dataset.rollType) {
            if (dataset.rollType == 'item') {
                const itemId = element.closest('.item').dataset.itemId;
                const item = this.actor.items.get(itemId);
                if (item) return item.roll();
            }
        }

        // Handle rolls that supply the formula directly.
        if (dataset.roll) {
            let label = dataset.label ? `[ability] ${dataset.label}` : '';
            let roll = new Roll(dataset.roll, this.actor.getRollData());
            roll.toMessage({
                speaker: ChatMessage.getSpeaker({actor: this.actor}), flavor: label, rollMode: game.settings.get('core', 'rollMode'),
            });
            return roll;
        }
    }
}
