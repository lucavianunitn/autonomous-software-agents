import { PddlDomain, PddlAction, PddlProblem, PddlExecutor, onlineSolver, Beliefset } from "@unitn-asa/pddl-client";
import { actionMove, actionStealAndMove } from "./actions.js";
import fs from 'fs';

export class Plan {

    stop () {
        console.log( 'stop plan and all sub intentions');
        for ( const i of this.#sub_intentions ) {
            i.stop();
        }
    }

    #sub_intentions = [];

    async subIntention ( desire, ...args ) {
        const sub_intention = new Intention( desire, ...args );
        this.#sub_intentions.push(sub_intention);
        return await sub_intention.achieve();
    }

}

export class ReachRandomDelivery extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'random';
    }

    async execute (temp, agentX, agentY, map) {

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
        console.log(problem)
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

export class GoPickUp extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_pick_up';
    }

    async execute (temp, agentX, agentY, map ) {
        const beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())

        beliefset.declare('me me');
        beliefset.declare('at me tile_'+agentX+'_'+agentY);

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            'and (at me tile_17_12)'
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => console.log('right')}
                                             ,{ name: 'move_left', executor: () => console.log('left')}
                                             ,{ name: 'move_up', executor: () =>  console.log('up')}
                                             ,{ name: 'move_down', executor: () =>  console.log('down')}
                                             ,{ name: 'pick_up', executor: () =>  console.log('pick_up')});

        pddlExecutor.exec( plan )
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