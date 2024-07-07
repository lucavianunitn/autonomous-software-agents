import { Agent } from "./Agent.js";
import { actionMove, actionPickUp, actionPutDown } from "./actions.js";

const MAX_CARRIED_PARCELS = 5;

export class AgentTeam extends Agent {

    // a variable that, if set to true, will make the agent move only through directives from its teammate
    #stayIdle;
    get stayIdle() { return this.#stayIdle; }
    set stayIdle(stayIdle) { this.#stayIdle = stayIdle; }

    #teammateId;
    get teammateId() { return this.#teammateId; }
    set teammateId(id) { this.#teammateId = id; }

    #teammatePosition;
    get teammatePosition() { return this.#teammatePosition; }
    set teammatePosition(pos) { this.#teammatePosition = pos; }

    #teammateDesire = "random";
    get teammateDesire() { return this.#teammateDesire; }
    set teammateDesire(desire) { this.#teammateDesire = desire; }

    // Debug Flags
    #onReceivedMsgVerbose = process.env.ON_RECEIVED_MSG_VERBOSE === "true"
    
    constructor(host, token) {

        super(host, token);

        this.onCommunication();
        this.stayIdle = false;

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

            // In the case the agent is involved in a teamwork, make it idle without make it considering other intentions
            if (this.stayIdle) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            // Consumes intention_queue if not empty
            if ( this.intentionQueue.length > 0 ) {
            
                const intention = this.getCurrentIntention();

                // Start achieving intention
                await intention.achieve().catch( error => { console.log(error); } );

                // Remove from the queue
                this.intentionQueue.shift();

            } else {

                let isMapDefined = this.map !== undefined;

                if (isMapDefined) {

                    // I need to know my teammate position in order to understand if I need its collaboration during the delivery. This information is used also in selectParcel()
                    if (this.perceivedAgents.has(this.teammateId) === false){
                        await this.askCoordinates();
                        this.perceivedAgents.set(this.teammateId, {x:this.teammatePosition.x, y:this.teammatePosition.y});
                    }

                    // Select the best parcel to pick up. needTeammate indicates if the help of the teammate agent is needed to deliver it.
                    let [bestParcelId, needTeammate] = this.selectParcel();
                    let parcel = this.perceivedParcels.get(bestParcelId);

                    if (bestParcelId === null && this.carriedParcels > 0){ // if I'm carrying a parcel and there aren't more appealing ones I'll deliver

                        let canDeliver;
                        [canDeliver, needTeammate] = this.evaluateDelivery(this.position.x, this.position.y);

                        if (canDeliver) {

                            if (needTeammate) { // if the agent need the teammate help in order to deliver, ask for its availability and eventually deliver

                                let teammateAvailability = await this.askAvailability(); //if the teammate is available, make it idle in order to follow the current agent instructions
        
                                if (teammateAvailability){
                                    await this.askCoordinates();
                                    this.addIntention("go_delivery_team");
                                }
        
                            }else{ // if the agent don't need the teammate help in order to deliver, deliver without involving it
                                this.addIntention("go_delivery");
                            }
                        }
            
                    }
                    else if (parcel !== undefined) { // if an appealing parcel is found

                        if (this.#teammateDesire !== "random") {  //if that parcel is not currently considerable by my teammate, try to pick it up and not making it considerable by the teammate in the future

                            await this.addInTeammateBlacklist(parcel.id);
                            this.addIntention("go_pick_up", parcel.x, parcel.y, parcel.id);

                        }else{ // if instead also the teammate is idle and wants to pick it up

                            await this.askCoordinates();

                            let meParcelDistance = this.map.pathBetweenTiles(this.position, [parcel.x,parcel.y], this.perceivedAgents)[0];
                            let teammateParcelDistance = this.map.pathBetweenTiles([this.teammatePosition.x,this.teammatePosition.y], [parcel.x,parcel.y], this.perceivedAgents)[0];

                            if (
                                (this.name.slice(-1) === "1" && meParcelDistance <= teammateParcelDistance) ||
                                (this.name.slice(-1) === "2" && meParcelDistance < teammateParcelDistance) ||
                                teammateParcelDistance === -1) { // make it pick it up by the nearest agent (or by considering their name as discriminating factor in the case the distance will be the same)

                                this.addInTeammateBlacklist(parcel.id);
                                this.addIntention("go_pick_up", parcel.x, parcel.y, parcel.id);

                            }
                            else
                                this.addIntention("random");

                        }
                    }
                    
                    if(this.intentionQueue.length == 0) // if the agent will not picking up or delivering, make it moving random in order to inspect the enviroment
                        this.addIntention("random");

                    const intention = this.getCurrentIntention();
                    const desire = intention ? intention.desire : "random";

                    this.shareDesire(desire); // share the desire pushed in the intention queue to the teammate
                }

            }

            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    /**
     * It will find the best parcel to try to pickup based on its estimated profit once delivered considering:
     * - the parcel value (higher is better)
     * - the parcel distance to the agent (lower is better)
     * - the parcel distance to the nearest delivery tile (lower is better)
     * - the number of parcels already carried (more parcels carried make less appealing to pick-up others)
     * @returns {Object} bestParcel - the id of the most appealing parcel (String), needTeammate - the necessity to use the teammate during the parcel delivery (Boolean)
     */
    selectParcel() {

        let bestScore = 0;
        let bestParcel = null;
        let needTeammate = false;

        const agent = this;
        const map = this.map;
        const position = this.position;
        const perceivedAgents = this.perceivedAgents;
        const areParcelExpiring = this.areParcelExpiring;
        const carriedParcels = this.carriedParcels;

        let perceivedAgentsNoTeammate = new Map(perceivedAgents);
        perceivedAgentsNoTeammate.delete(this.#teammateId) // In order to dont't see the teammate as an obstacle during the delivery process, where team work could happen

        // If agent is carrying to many parcels, do not select another parcel (and go to delviery phase).
        if (carriedParcels > MAX_CARRIED_PARCELS)
            return [bestParcel, needTeammate];
        
        this.perceivedParcels.forEach(function(parcel) {

            let parcelId = parcel.id;

            // If the parcel is already carried by an agent or is in the blacklist, skip it.
            if (parcel.carriedBy !== null || agent.parcelsBlackList.includes(parcelId))
                return; // continue

            let parcelReward = parcel.reward;

            // Calculate agent-parcel distance
            let [parcelAgentDistance, path, directions] = map.pathBetweenTiles(position, [parcel.x, parcel.y], perceivedAgents);
            // Get the distance from the delivery tile that is closer to the parcel, not considering the teammate as an obstacle
            let [parcelNearestDeliveryDistance, coords] = map.getNearestDelivery([parcel.x, parcel.y], perceivedAgentsNoTeammate);

            if (parcelAgentDistance < 0)
                return; // continue

            // Evaluate if the delivery of the current parcel is possible and if the delviery requires the help of the teammate agent.
            let [canDeliver, needTeammateTemp] = agent.evaluateDelivery(parcel.x, parcel.y);

            if (canDeliver === false)
                return; // continue

            // Calculate the maximum score obtainable from the parcel by considering if there's a decadyng score or not.
            let parcelScore = 0;

            if (areParcelExpiring) {

                let totalPathLength = parcelAgentDistance + parcelNearestDeliveryDistance;

                parcelScore = parcelReward - totalPathLength;

                // If we are already carrying parcels, we consider also the points lost on the carried parcels to get this parcel
                if (carriedParcels > 0)
                    parcelScore = parcelScore - (carriedParcels * totalPathLength);

            } else
                parcelScore = parcelReward

            if (parcelScore > bestScore && parcelAgentDistance > 0 && parcelNearestDeliveryDistance >= 0 && parcel.carriedBy === null) {
                bestScore = parcelScore;
                bestParcel = parcelId;
                needTeammate = needTeammateTemp;
            }

        })
        
        return [bestParcel, needTeammate];

    }

    /**
     * It will find if, from a certain tile, it's possible to reach a delivery tile, and eventually if can be reached only through teamwork
     * @param {Number} fromX - The X coordinate of the tile considered as starting point 
     * @param  {Number} fromY - The Y coordinate of the tile considered as starting point 
     * @returns {Object} canDeliver - the possibility to reach a delivery tile (Boolean), needTeammate - the necessity to use the teammate during the parcel delivery (Boolean)
     */
    evaluateDelivery(fromX, fromY) {

        const perceivedAgents = this.perceivedAgents;

        let perceivedAgentsNoTeammate = new Map(perceivedAgents);
        perceivedAgentsNoTeammate.delete(this.#teammateId) // In order to don't see the teammate as an obstacle

        // Attempt to deliver without involving the teammate
        let [nearestDeliveryDistance, coords] = this.map.getNearestDelivery([fromX, fromY], perceivedAgents);

        let canDeliver = true;
        let needTeammate = false;

        if (nearestDeliveryDistance === Infinity) { // See if it is possible to deliver parcel with the help of teammate.

            // Attempt to deliver by involving the teammate
            [nearestDeliveryDistance, coords] = this.map.getNearestDelivery([fromX, fromY], perceivedAgentsNoTeammate);

            if (nearestDeliveryDistance === Infinity)
                canDeliver = false;
            else
                needTeammate = true;

        }

        return [canDeliver, needTeammate];

    }

    /**
     * It will ask to the teammate to share its coordinates
     */
    async askCoordinates(){

        var reply = await this.client.ask( this.teammateId, {
            operation: "ask_teammate_coordinates",
        } );

        this.teammatePosition = reply;

        if (this.#onReceivedMsgVerbose){
            console.log(this.name+": my teammate position is")
            console.log(this.teammatePosition)
        }

    }

    /**
     * It will share the current agent desire with the teammate
     */
    async shareDesire(desire){

        await this.client.say( this.teammateId, {
            operation: "share_desire",
            body: desire
        } );

        if (this.#onReceivedMsgVerbose)
            console.log(this.name+": my current desire is "+desire)

    }

    /**
     * It will share the current perceived parcels with the teammate
     */
    async shareParcels(perceivedParcels){

        await this.client.say( this.teammateId, {
            operation: "share_parcels",
            body: perceivedParcels
        } );

    }

    /**
     * It will order to the teammate to include in its blacklist a certain parcel
     */
    async addInTeammateBlacklist(parcelId){

        await this.client.say( this.teammateId, {
            operation: "add_in_tm_blacklist",
            body: parcelId
        } );

    }

    /**
     * It ask to the teammate its availability durinfìg the delivery teamwork
     * @returns {Boolean} reply - the teammate availability
     */
    async askAvailability(){

        var reply = await this.client.ask( this.teammateId, {
            operation: "ask_teammate_availability",
        } );

        if (this.#onReceivedMsgVerbose){
            console.log(this.name+": my teammate availability is "+reply)
        }

        return reply;

    }

    // it handles the action to be performed after having received a message from the teammate
    onCommunication(){

        const agent = this;
        const client = this.client;

        client.onMsg( async (id, name, msg, reply) => {

            if (id !== agent.#teammateId) return; // it ensures that the messages comes from the teammate

            switch(msg.operation){

                case "ask_teammate_coordinates":

                    reply({x: Math.round(this.position.x), y: Math.round(this.position.y)});

                    break;

                case "share_desire":

                    this.teammateDesire = msg.body;

                    if (this.#onReceivedMsgVerbose)
                        console.log(this.name+": my teammate desire is "+msg.body)

                    break;

                case "share_parcels":

                    let notTakenParcels = false;

                    for (const parcel of msg.body)
                        this.perceivedParcels.set(parcel.id, parcel);
        
                    // Check if at least one parcel is not taken
                    notTakenParcels = notTakenParcels ? true : this.selectParcel()[0] !== null;
        
                    if (notTakenParcels)
                        this.eventEmitter.emit("found free parcels"); // intention revision is performed
        
                    if (this.#onReceivedMsgVerbose){
                        console.log(this.name+": my teammate shares with me the following parcels");
                        console.log(msg.body);
                    }

                    break;   

                case "add_in_tm_blacklist":

                    this.addParcelInBlacklist(msg.body, 20);

                    if (this.#onReceivedMsgVerbose)
                        console.log(this.name+": following my teammate suggestion, I've added in my blacklist "+msg.body);

                    break;

                case "ask_teammate_availability":

                    const intention = agent.getCurrentIntention();

                    if (intention === undefined || intention.desire === "random") {
                        agent.stayIdle = true;
                        agent.stop();
                        reply(true);
                    }
                    else
                        reply(false);

                    break;

                case 'execute_action':

                    try {
                        switch (msg.body) {
                            case 'MOVE_RIGHT':
                                await actionMove(client, 'right');
                                break;
                            case 'MOVE_LEFT':
                                await actionMove(client, 'left');
                                break;
                            case 'MOVE_UP':
                                await actionMove(client, 'up');
                                break;
                            case 'MOVE_DOWN':
                                await actionMove(client, 'down');
                                break;
                            case 'PICK_UP':
                                let pickedParcels = (await actionPickUp(client)).length;
                                agent.carriedParcels = pickedParcels + agent.carriedParcels;
                                break;
                            case 'PUT_DOWN':
                            case 'PUT_DOWN_ON_DELIVERY':
                                await actionPutDown(client);
                                agent.carriedParcels = 0;
                                break;
                        }

                        if (this.#onReceivedMsgVerbose)
                            console.log(this.name+": following my teammate suggestion, I've performed the action "+msg.body);

                        if (action !== 'PUT_DOWN_ON_DELIVERY' && action !== 'PUT_DOWN'){
                            let pickedParcels = (await actionPickUp(client)).length;
                            this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
                        }

                        reply(true) // the action requested was correctly performed
                    } catch {
                        reply(false) // the action requested failed
                    }

                    break;
                    
                case 'release_availability':

                    this.stayIdle = false

                    break;  

            }
    
        })

        /**
         * - If the agent has go_pick_up as current desire, it ensures that if the parcel is in the agent's view and it's no more appealing (e.g. is blocked or moved), the go_pick_up plan is revisioned
         * - If the teammate is idle (e.g. is moving random), the agent shares with it the perceived parcels in order to make it do some pick-ups
        */
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

            if (this.teammateDesire === "random" && this.perceivedParcels.size !== 0)
                this.shareParcels(perceivedParcels);

        })
    }
}