import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
import { TileMap } from "./TileMap.js";
import { EventEmitter } from "events";
import { Intention } from "./Intention.js";

export class Agent {

    #client;
    get client() { return this.#client; }

    #agentToken;
    get agentToken() { return this.#agentToken; }
    set agentToken(token) { this.#agentToken = token; }

    #id;
    get id() { return this.#id; }
    set id(id) { this.#id = id; }

    #name;
    get name() { return this.#name; }
    set name(name) { this.#name = name; }

    #position = { x:null, y:null };
    get position() { return this.#position; }
    set position(position) { this.#position = position; }

    #score;
    get score() { return this.#score; }
    set score(score) { this.#score = score; }

    #map;
    get map() { return this.#map; }
    set map(map) { this.#map = map; }

    #intentionQueue = new Array();
    get intentionQueue() { return this.#intentionQueue; }

    #eventEmitter = new EventEmitter();
    get eventEmitter() { return this.#eventEmitter; }

    #perceivedParcels = new Map();
    get perceivedParcels() { return this.#perceivedParcels; }

    #perceivedAgents = new Map();
    get perceivedAgents() { return this.#perceivedAgents; }

    #carriedReward = 0;
    get carriedReward() { return this.#carriedReward; }
    set carriedReward(reward) { this.#carriedReward = reward; }

    #carriedParcels = 0;
    get carriedParcels() { return this.#carriedParcels; }
    set carriedParcels(parcels) { this.#carriedParcels = parcels; }

    #parcelsBlackList = [];
    get parcelsBlackList() { return this.#parcelsBlackList; }

    // Debug Flags
    #onYouVerbose = process.env.ON_YOU_VERBOSE === "true"
    #onMapVerbose = process.env.ON_MAP_VERBOSE === "true"
    #onParcelsSensingVerbose = process.env.ON_PARCELS_SENSING_VERBOSE === "true"
    #onAgentsSensingVerbose = process.env.ON_AGENT_SENSING_VERBOSE === "true"

    // Other flags
    #areParcelExpiring = true; // if true, the parcels that for sure cannot be delivered before their expiration won't be considered for pickup

    constructor(host, token) {

        this.#agentToken = token;
        this.#client = new DeliverooApi(host, token);

        // Listeners

        this.client.onConnect( () => console.log( "socket", this.client.socket.id ) );
        this.client.onDisconnect( () => console.log( "disconnected", this.client.socket.id ) );
        /**
         * The event handled by this listener is emitted on agent connection.
         */
        this.client.onMap( ( width, height, tilesInfo ) => {

            this.#map = new TileMap(width, height, tilesInfo);

            if(this.#onMapVerbose) this.#map.printDebug();

        });
        /**
         * The event handled by this listener is emitted on agent connection and on each movement of the agent.
         * For each movement there are two event: one partial and one final.
         * NOTE: the partial movement gives a value like 10.4 on movements left and down; gives a value like 10.6 on mevements right and up.
         */
        this.client.onYou( ( {id, name, x, y, score} ) => {

            this.#id = id;
            this.#name = name;
            this.#position = {x:x, y:y};
            this.#score = score;

            if(this.#onYouVerbose) this.printDebug();

        });
        /**
         * The event handled by this listener is emitted on agent connection and on each movement of the agent.
         * NOTE: this event is emitted also when a parcel carried by another agents enters in the visible area? 
         */
        this.client.onParcelsSensing( async ( perceivedParcels ) => {

            this.perceivedParcels.clear();

            let notTakenParcels = false;

            for (const parcel of perceivedParcels) {
                this.perceivedParcels.set(parcel.id, parcel);
            }

            // Check if at least one parcel is not taken
            notTakenParcels = notTakenParcels ? true : this.selectParcel()[1] !== null;

            if (notTakenParcels)
                this.eventEmitter.emit("found free parcels"); // intention revision is performed
            
            if(this.#onParcelsSensingVerbose) this.printPerceivedParcels();

        });
        /**
         * The event handled by this listener is emitted on agent connection, on each movement of the agent and
         * on each movement of other agents in the visible area.
         */
        this.client.onAgentsSensing( async ( perceivedAgents ) => {

            this.perceivedAgents.clear();

            for (const agent of perceivedAgents)
                this.perceivedAgents.set(agent.id, agent);
            
                if(this.#onAgentsSensingVerbose) this.printPerceivedAgents();

        });

    }

    /**
     * Adds a new intention in the intention queue if it is not already inserted.
     * @param {*} desire 
     * @param  {...any} predicate 
     * @returns 
     */
    async addIntention ( desire, ...predicate ) {

        if ( this.intentionQueue.find( (i) => i.predicate.join(' ') == predicate.join(' ') ) )
            return;

        const intention = new Intention(this, desire, predicate);
        this.intentionQueue.push(intention);
    }

    /**
     * Returns the first intention in the queue.
     * @returns {(Intention|undefined)}
     */
    getCurrentIntention() {
        
        return this.intentionQueue[0];

    }

    /**
     * Stops all the intentions in the intention queue.
     */
    async stop ( ) {

        for (const intention of this.intentionQueue)
            intention.stop();

    }

    /**
     * Function that must implement the intention loop of the agent.
     */
    async intentionLoop ( ) {

        throw new Error('You have to implement the async method intentionLoop!');

    }

    /**
     * Function that must implement the logic to choose the next parcel to get.
     */
    selectParcel() {

        throw new Error('You have to implement the method selectParcel!');

    }

        
    /**
     * Function that implement the logic for adding a parcel into the blacklist.
     */
    addParcelInBlacklist(parcelId, maxBlacklistSize) {

        this.parcelsBlackList.push(parcelId);

        if(this.parcelsBlackList.length > maxBlacklistSize){
            this.parcelsBlackList.shify();
        }

    }

    printDebug() {

        console.log("Agent {");
        console.log(`- agentToken = ${this.agentToken}`);
        console.log(`- id = ${this.id}`);
        console.log(`- name = ${this.name}`);
        console.log(`- position = x: ${this.position.x} , y: ${this.position.y}`);
        console.log(`- score = ${this.score}`);
        console.log("}");
        console.log();
    }

    printPerceivedParcels() {

        console.log(`Agent '${this.name}' perceived parcels map:`);
        console.log(this.perceivedParcels);
        console.log();
    }

    printPerceivedAgents() {

        console.log(`Agent '${this.name}' perceived agents map:`);
        console.log(this.perceivedAgents);
        console.log();
    }

}