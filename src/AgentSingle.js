import { Agent } from "./Agent.js";

const MAX_CARRIED_PARCELS = 5;

export class AgentSingle extends Agent {

    constructor(host, token) {

        super(host, token);

        this.setupSingleAgent();

        /**
         * This listener is used to stop executing random intentions when a new free parcel is found.
         */
        this.eventEmitter.on("found free parcels", () => {

            const intention = this.getCurrentIntention();

            if (intention === undefined)
                return;

            if (intention.desire === "random")
                intention.stop();

        })

        /**
         * This listener is used to stop executing go_pick_up intentions when a new the targeted parcel is no more available (e.g. moved or blocked).
         */
        this.eventEmitter.on("parcel to pickup no more available", () => {
            const intention = this.getCurrentIntention();
            
            if (intention === undefined)
                return;

            if (intention.desire === "go_pick_up")
                intention.stop();

        })
    }

    async intentionLoop ( ) {

        while ( true ) {

            // If there's at least one intention in queue, execute it
            if ( this.intentionQueue.length > 0 ) {
            
                const intention = this.getCurrentIntention();

                await intention.achieve().catch( error => { console.log(error); } );

                this.intentionQueue.shift(); // Remove intention from the queue

            }
            else {

                let isMapDefined = this.map !== undefined;

                if (isMapDefined) {

                    let bestParcelId = this.selectParcel();
                    let parcel = this.perceivedParcels.get(bestParcelId);

                    if (bestParcelId === null && this.carriedParcels > 0) { 
                        this.addIntention("go_delivery"); // the carried parcels are delivered in the nearest delivery tile
                    }
                    else if (parcel !== undefined) {
                        this.addIntention("go_pick_up", parcel.x, parcel.y, parcel.id); // the most appealing parcel is pickup
                    }
                    else {
                        this.addIntention("random"); // random looking movements are performed in order to inspect the map
                    }
                }

            }

            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    /**
     * It will find the best parcelID to try to pickup based on its estimated profit once delivered considering:
     * - the parcel value (higher is better)
     * - the parcel distance to the agent (lower is better)
     * - the parcel distance to the nearest delivery tile (lower is better)
     * - the number of parcels already carried (more parcels carried make less appealing to pick-up others)
     * @returns {number|null} id of the best parcel
     */
    selectParcel() {

        let bestScore = 0;
        let bestParcelId = null;

        const agent = this;
        const map = this.map;
        const position = this.position;
        const perceivedAgents = this.perceivedAgents;
        const areParcelExpiring = this.areParcelExpiring;
        const carriedParcels = this.carriedParcels;

        // If agent is carrying to many parcels, do not select another parcel (and go to delviery phase).
        if (carriedParcels > MAX_CARRIED_PARCELS)
            return bestParcelId;

        this.perceivedParcels.forEach(function(parcel) {

            let parcelId = parcel.id;

            // If the parcel is already carried by an agent or is in the blacklist, skip it.
            if (parcel.carriedBy !== null || agent.parcelsBlackList.includes(parcelId))
                return; // continue
            
            let parcelReward = parcel.reward;

            // Calculate agent-parcel distance
            let [parcelAgentDistance, path, directions] = map.pathBetweenTiles(position, [parcel.x, parcel.y], perceivedAgents);
            // Get the distance from the delivery tile that is closer to the parcel
            let [parcelNearestDeliveryDistance, coords] = map.getNearestDelivery([parcel.x, parcel.y], perceivedAgents);

            // Calculate the maximum score obtainable from the parcel by considering if there's a decadyng score or not.
            let parcelScore = 0;
            
            if (areParcelExpiring) {

                let totalPathLength = parcelAgentDistance + parcelNearestDeliveryDistance;

                parcelScore = parcelReward - totalPathLength;

                // If we are already carrying parcels, we consider also the points lost on the carried parcels to get this parcel
                if (carriedParcels > 0)
                    parcelScore = parcelScore - (carriedParcels * totalPathLength);

            }
            else
                parcelScore = parcelReward
            
            if (parcelScore > bestScore && parcelAgentDistance > 0 && parcelNearestDeliveryDistance >= 0 && parcel.carriedBy === null) {
                bestScore = parcelScore;
                bestParcelId = parcelId;
            }

        })

        return bestParcelId;

    }

    setupSingleAgent(){

        const client = this.client;

        /**
         * If the agent has go_pick_up as current desire, it ensures that if the parcel is in the agent's view and it's no more appealing (e.g. is blocked or moved), the go_pick_up plan is revisioned
         */
        client.onParcelsSensing( async ( perceivedParcels ) => {
            const intention = this.getCurrentIntention();
            const desire = intention ? intention.desire : "random";
            const predicate = intention ? intention.predicate : "";
            const perceivedAgents = this.perceivedAgents;

            if(desire === "go_pick_up" && this.perceivedParcels.has(predicate[2])){
                const parcel_to_pickup_pos = {x: predicate[0] ,y: predicate[1]}

                if(this.map.createAgentsMap(perceivedAgents)[parcel_to_pickup_pos.x][parcel_to_pickup_pos.y] || //so, the package I want to pickup is no more available because blocked
                this.perceivedParcels.get(predicate[2]).x !== parcel_to_pickup_pos.x ||  
                this.perceivedParcels.get(predicate[2]).y !== parcel_to_pickup_pos.y){ //so, the package I want to pickup is no more available because moved
                    
                    this.addParcelInBlacklist(predicate[2], 20); // parcel added in the blacklist, so it will no more considered.
                    this.eventEmitter.emit("parcel to pickup no more available"); // intention revision is performed
                }
            }
        })
    }

}