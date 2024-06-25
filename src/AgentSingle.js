import { Agent } from "./Agent.js";

export class AgentSingle extends Agent {

    constructor(host, token) {

        super(host, token);

        this.onCommunication();

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

                    let bestParcelId = this.selectParcel()[1];
                    let parcel = this.perceivedParcels.get(bestParcelId);

                    if (bestParcelId === null && this.carriedParcels > 0) {
                        this.addIntention("go_delivery");
                    }
                    else if (parcel !== undefined) {
                        this.addIntention("go_pick_up", parcel.x, parcel.y, parcel.id);
                    }
                    else {
                        this.addIntention("random");
                    }
                }

                // TODO: random move if map is not defined?

            }

            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    /**
     * TODO: improve this method
     * It will found the best parcel to try to pickup based on its estimated profit once delivered considering:
     * - the parcel value (higher is better)
     * - the parcel distance to the agent (lower is better)
     * - the parcel distance to the nearest delivery tile (lower is better)
     */
    selectParcel() {

        let bestScore = 0;
        let bestParcel = null;
        let bestDelivery = null;

        const agent = this;
        const map = this.map;
        const position = this.position;
        const perceivedAgents = this.perceivedAgents;
        const areParcelExpiring = this.areParcelExpiring;
        const carriedParcels = this.carriedParcels;

        // TODO: vogliamo mettere un massimo di parcels da prendere di fila?
        if (carriedParcels > 5)
            return [bestScore, bestParcel, bestDelivery];

        this.perceivedParcels.forEach(function(parcel) {

            let parcelId = parcel.id;

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
            else {

                parcelScore = parcelReward

            }
            
            if (parcelScore > bestScore && parcelAgentDistance > 0 && parcelNearestDeliveryDistance >= 0 && parcel.carriedBy === null) {
                bestScore = parcelScore;
                bestParcel = parcelId;
                bestDelivery = coords;
            }

        })

        /**
         * TODO: forse possiamo fare ritornare solamente il parcelId?
         * Lo score e la best delivery alla fine non li usiamo.
         */
        return [bestScore, bestParcel, bestDelivery];

    }

    onCommunication(){
        const agent = this;
        const client = this.client;

        client.onParcelsSensing( async ( perceivedParcels ) => {
            const intention = this.getCurrentIntention();
            const desire = intention ? intention.desire : "random";
            const predicate = intention ? intention.predicate : "";
            const perceivedAgents = this.perceivedAgents;

            if(desire === "go_pick_up" && this.perceivedParcels.has(predicate[2])){
                const parcel_to_pickup_pos = {x: predicate[0] ,y: predicate[1]}

                if(this.map.createAgentsMap(perceivedAgents)[parcel_to_pickup_pos.x][parcel_to_pickup_pos.y] ||
                this.perceivedParcels.get(predicate[2]).x !== parcel_to_pickup_pos.x ||  
                this.perceivedParcels.get(predicate[2]).y !== parcel_to_pickup_pos.y){ //so, the package I want to pickup is no more available because expired, moved, taken or blocked by another agent
                    
                    this.addParcelInBlacklist(predicate[2], 20);
                    this.eventEmitter.emit("parcel to pickup no more available"); // intention revision is performed
                }
            }
        })
    }

}