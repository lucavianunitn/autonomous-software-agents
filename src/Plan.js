import { PddlDomain, PddlAction, PddlProblem, PddlExecutor, onlineSolver, Beliefset } from "@unitn-asa/pddl-client";
import { actionMove, actionPickUp, actionPutDown, actionRandomMove } from "./actions.js";
import fs from 'fs';

const TOTAL_RANDOM_WALK_MOVES = 30;

class Plan {

    #parent; // parent refers to caller
    get parent() { return this.#parent; }

    #stopped = false; // This is used to stop the plan
    get stopped() { return this.#stopped; }

    constructor ( parent ) {

        this.#parent = parent;

    }

    stop () {

        this.#stopped = true;
        
    }

    considerNearAgents(beliefset, agentX, agentY, perceivedAgents){

        perceivedAgents.forEach((agentObstacle) => {
            let agentObstacleRounded = {x: Math.round(agentObstacle.x), y: Math.round(agentObstacle.y)};
            if(Math.abs(agentObstacleRounded.x-agentX) <= 1 || Math.abs(agentObstacleRounded.y-agentY) <= 1){
                beliefset.declare('blocked tile_'+agentObstacleRounded.x+'_'+agentObstacleRounded.y); 
                // the tile my agent is near to is blocked by another one, are not considered more distant agents because we assume that in the meanwhile they are in another position
            }
        })
        return beliefset;

    }
}

/**
 * A plan that satisfy the random desire. A random delivery tile is chosen and a pddl problem is solved in order to reach it
 */
export class ReachRandomDelivery extends Plan {

    static isApplicableTo ( desire ) {
        return desire === 'random';
    }

    async execute () {

        let agentX = this.parent.position.x;
        let agentY = this.parent.position.y;
        let client = this.parent.client;
        let map = this.parent.map;
        let perceivedAgents = this.parent.perceivedAgents;

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false)
            throw {message: "Invalid parameters"};

        let beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())

        beliefset = this.considerNearAgents(beliefset, agentX, agentY, perceivedAgents);

        beliefset.declare('me me');
        beliefset.declare('at me tile_'+agentX+'_'+agentY);
        beliefset.declare(`blocked tile_${agentX}_${agentY}`);

        let rndDelivery = map.getRandomDelivery();

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            `and (at me tile_${rndDelivery.x}_${rndDelivery.y})`
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        //console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){

            if (this.stopped)
                throw {message: `Stopped Plan ReachRandomDelivery`};

            const action = plan[step].action;

            switch (action) {
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
            }

            if(action !== 'PUT_DOWN_ON_DELIVERY' && action !== 'PUT_DOWN'){
                let pickedParcels = (await actionPickUp(client)).length;
                this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
            }
        }       
    }

}

/**
 * A plan that satisfy the random desire. A random movements (different from the previous one) is performed
 */
export class RandomWalk extends Plan {

    static isApplicableTo ( desire ) {
        return desire === 'random';
    }

    async execute () {

        let client = this.parent.client;

        let prevMove = 'right';

        for (let i=0; i<TOTAL_RANDOM_WALK_MOVES; i++) {

            if (this.stopped)
                throw {message: `Stopped Plan RandomWalk`};

            prevMove = await actionRandomMove(client, prevMove);

            let pickedParcels = (await actionPickUp(client)).length;
            this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
        }

    }

}

/**
 * A plan that satisfy the go_pick_up desire. The most appealing parcel is found and a pddl problem is solved in order to reach it and pick it up
 */
export class GoPickUp extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_pick_up';
    }

    async execute (parcelX, parcelY, parcelId) {

        let agentX = this.parent.position.x;
        let agentY = this.parent.position.y;
        let client = this.parent.client;
        let map = this.parent.map;
        let perceivedAgents = this.parent.perceivedAgents;

        // This prevents the definition of a pddl problem with partial coordinates (like 15.4) that would brake the execution.
        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false ||
            Number.isInteger(parcelX) === false || Number.isInteger(parcelY) === false)
            throw {message: "Invalid parameters"};

        let beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())
        beliefset = this.considerNearAgents(beliefset, agentX, agentY, perceivedAgents);

        beliefset.declare(`me me`);
        beliefset.declare(`at me tile_${agentX}_${agentY}`);
        beliefset.declare(`blocked tile_${agentX}_${agentY}`);
        beliefset.declare(`parcel ${parcelId}`);
        beliefset.declare(`at ${parcelId} tile_${parcelX}_${parcelY}`);

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            `and (carry me ${parcelId})`
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        //console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){

            if (this.stopped)
                throw {message: `Stopped Plan GoPickUp`};

            const action = plan[step].action;

            switch (action) {
                case 'MOVE_RIGHT':
                    await actionMove(client,'right');
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
                    this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
                    break;
            }

            if(action !== 'PUT_DOWN_ON_DELIVERY' && action !== 'PUT_DOWN'){
                let pickedParcels = (await actionPickUp(client)).length;
                this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
            }
        }       
    }

}

/**
 * A plan that satisfy the go_delivery desire. A pddl problem is solved in order to reach the nearest delivery tile, and to put down here the carried parcels
 */
export class GoDelivery extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_delivery';
    }

    async execute () {

        let agentX = this.parent.position.x;
        let agentY = this.parent.position.y;
        let client = this.parent.client;
        let map = this.parent.map;
        let perceivedAgents = this.parent.perceivedAgents;

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false)
            throw {message: "Invalid parameters"};

        let beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())
        beliefset = this.considerNearAgents(beliefset, agentX, agentY, perceivedAgents);

        beliefset.declare(`me me`);
        beliefset.declare(`at me tile_${agentX}_${agentY}`);
        beliefset.declare(`blocked tile_${agentX}_${agentY}`);
        beliefset.declare(`parcel p`);
        beliefset.declare(`carry me p`);
        beliefset.declare(`to_deliver`);

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            `and (not(to_deliver))`
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        //console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){

            if (this.stopped)
                throw {message: `Stopped Plan GoDelivery`};

            const action = plan[step].action;

            switch (action) {
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
                case 'PUT_DOWN_ON_DELIVERY':
                    await actionPutDown(client);
                    this.parent.carriedParcels = 0;
                    break;
            }

            if(action !== 'PUT_DOWN_ON_DELIVERY' && action !== 'PUT_DOWN'){
                let pickedParcels = (await actionPickUp(client)).length;
                this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
            }
        }
    }
}

/**
 * A plan that satisfy the go_delivery desire. A pddl problem is solved in order to reach the nearest delivery tile, and to put down here the carried parcels, also by using the teammate presence
 */
export class GoDeliveryTeam extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_delivery_team';
    }

    async execute () {

        let client = this.parent.client;
        let agentX = this.parent.position.x;
        let agentY = this.parent.position.y;
        
        let teammateId = this.parent.teammateId;
        let teammateX = this.parent.teammatePosition.x;
        let teammateY = this.parent.teammatePosition.y;

        let map = this.parent.map;
        let perceivedAgents = this.parent.perceivedAgents;

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false ||
            Number.isInteger(teammateX) === false || Number.isInteger(teammateY) === false)
            throw {message: "Invalid parameters"};

        let beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())
        beliefset = this.considerNearAgents(beliefset, agentX, agentY, perceivedAgents);

        beliefset.declare(`me me`);
        beliefset.declare(`at me tile_${agentX}_${agentY}`);
        beliefset.declare(`blocked tile_${agentX}_${agentY}`);

        beliefset.declare(`me tm`);
        beliefset.declare(`at tm tile_${teammateX}_${teammateY}`);
        beliefset.declare(`blocked tile_${teammateX}_${teammateY}`);

        beliefset.declare(`parcel p`);
        beliefset.declare(`carry me p`);
        beliefset.declare(`to_deliver`);

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            `and (not(to_deliver))`
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        //console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        // console.log( plan );

        for (const step in plan){

            if (this.stopped)
                throw {message: `Stopped Plan GoDeliveryTeam`};

            const action = plan[step].action;

            if (plan[step]["args"][0] === "ME"){
                switch (action) {
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
                        this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
                        break;
                    case 'PUT_DOWN':
                    case 'PUT_DOWN_ON_DELIVERY':
                        await actionPutDown(client);
                        this.parent.carriedParcels = 0;
                        break;
                }

                if(action !== 'PUT_DOWN_ON_DELIVERY' && action !== 'PUT_DOWN'){
                    let pickedParcels = (await actionPickUp(client)).length;
                    this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
                }
            } else {
                let reply = await client.ask( teammateId, { 
                    operation: "execute_action",
                    body: action
                });
                //console.log(reply); 
            }
        }

        // the plan is finished, also for my teammate that can be freed
        client.say( teammateId, {
            operation: "release_availability"
        });

    }
}

function readFile ( path ) {
    return new Promise( (res, rej) => {
        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

export const planLibrary = [];
planLibrary.push( ReachRandomDelivery );
planLibrary.push( RandomWalk );
planLibrary.push( GoPickUp );
planLibrary.push( GoDelivery );
planLibrary.push( GoDeliveryTeam );