import { PddlDomain, PddlAction, PddlProblem, PddlExecutor, onlineSolver, Beliefset } from "@unitn-asa/pddl-client";
import { actionMove, actionStealAndMove, actionPickUp, actionPutDown } from "./actions.js";
import fs from 'fs';

class Plan {

    /**
     * #parent refers to caller
     */
    #parent;

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
    #sub_intentions = [];

    // This is used to stop the plan
    #stopped = false;

    constructor ( parent ) {
        this.#parent = parent;
    }

    get stopped () {
        return this.#stopped;
    }

    stop () {
        // this.log( 'stop plan' );
        this.#stopped = true;
        for ( const i of this.#sub_intentions ) {
            i.stop();
        }
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    async subIntention ( predicate ) {
        const sub_intention = new Intention( this, predicate );
        this.#sub_intentions.push( sub_intention );
        return await sub_intention.achieve();
    }

}

/**
 * TODO: find a way to implement the stoppig action
 */
export class ReachRandomDelivery extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'random';
    }

    async execute (agentX, agentY, map) {

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false)
            return Promise.resolve(1);

        const beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())

        beliefset.declare('me me');
        beliefset.declare('at me tile_'+agentX+'_'+agentY);

        let rndDelivery = map.getRandomDelivery();

        while (rndDelivery.x === agentX && rndDelivery.y === agentY)
            rndDelivery = map.getRandomDelivery();

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
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => actionStealAndMove('right').catch(err => {throw err})}
                                             ,{ name: 'move_left', executor: () => actionStealAndMove('left').catch(err => {throw err})}
                                             ,{ name: 'move_up', executor: () => actionStealAndMove('up').catch(err => {throw err})}
                                             ,{ name: 'move_down', executor: () => actionStealAndMove('down').catch(err => {throw err})});

        await pddlExecutor.exec( plan ).catch(err => {throw err});

    }

}

/**
 * TODO: incomplete
 */
export class GoPickUp extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_pick_up';
    }

    async execute (agentX, agentY, parcelX, parcelY, parcelId, map ) {

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false ||
            Number.isInteger(parcelX) === false || Number.isInteger(agentY) === false)
            return Promise.resolve(1);

        const beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())

        beliefset.declare('me me');
        beliefset.declare('at me tile_'+agentX+'_'+agentY);

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            `and (at me tile_${parcelX}_${parcelY}) (carry me ${parcelId})`
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        //console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => actionStealAndMove('right').catch(err => {throw err})}
                                             ,{ name: 'move_left', executor: () => actionStealAndMove('left').catch(err => {throw err})}
                                             ,{ name: 'move_up', executor: () => actionStealAndMove('up').catch(err => {throw err})}
                                             ,{ name: 'move_down', executor: () => actionStealAndMove('down').catch(err => {throw err})}
                                             ,{ name: 'pick_up', executor: () => actionPickUp().catch(err => {throw err})});

        await pddlExecutor.exec( plan ).catch(err => {throw err});
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
planLibrary.push( GoPickUp );
planLibrary.push( ReachRandomDelivery );