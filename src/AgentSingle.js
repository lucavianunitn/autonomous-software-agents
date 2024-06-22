import { Agent } from "./Agent.js";

export class AgentSingle extends Agent {

    constructor(host, token) {

        super(host, token);

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

                    if (this.carriedParcels > 0){
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

        const map = this.map;
        const position = this.position;
        const perceivedAgents = this.perceivedAgents;
        const areParcelExpiring = this.areParcelExpiring;

        this.perceivedParcels.forEach(function(parcel) {

            let parcelId = parcel.id;

            let parcelReward = parcel.reward;
            let [parcelAgentDistance, path, directions] = map.pathBetweenTiles(position, [parcel.x, parcel.y], perceivedAgents);
            let [parcelNearestDeliveryDistance, coords] = map.getNearestDelivery([parcel.x, parcel.y], perceivedAgents);

            let parcelScore = 0;
            if (areParcelExpiring){
                parcelScore = parcelReward - parcelAgentDistance - parcelNearestDeliveryDistance;
            }else{
                parcelScore = parcelReward
            }
            
            if (parcelScore > bestScore && parcelAgentDistance > 0 && parcelNearestDeliveryDistance >= 0 && parcel.carriedBy === null) {
                bestScore = parcelScore;
                bestParcel = parcelId;
                bestDelivery = coords;
            }

        })

        return [bestScore, bestParcel, bestDelivery];

    }

}