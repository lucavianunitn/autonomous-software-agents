import { planLibrary } from "./Plan.js";
import { shuffle } from "./utilities.js";

/**
 * Intention
 */
export class Intention {

    #desire;
    get desire() { return this.#desire; }

    #currentPlan; // Plan currently used for achieving the intention
    get currentPlan() { return this.#currentPlan; }
    
    #stopped = false; // This is used to stop the intention
    get stopped() { return this.#stopped; }

    #started = false;
    get started() { return this.#started; }

    #parent; // Refers to caller (the agent)
    get parent() { return this.#parent; }

    #predicate;
    get predicate() { return this.#predicate; }

    constructor ( parent, desire, predicate ) {

        this.#parent = parent;
        this.#desire = desire;
        this.#predicate = predicate;

    }

    stop() {

        this.#stopped = true;
        if (this.currentPlan)
            this.currentPlan.stop();

    }

    /**
     * Using the plan library to achieve an intention
     */
    async achieve () {

        if (this.started) // Cannot start twice
            return this;
        else
            this.#started = true;

        shuffle(planLibrary);

        // Trying all plans in the library
        for (const planClass of planLibrary) {

            // if stopped then quit
            if ( this.stopped ) throw {message : 'Stopped Intention', ...this.predicate};

            // if plan is 'statically' applicable
            if ( planClass.isApplicableTo( this.desire ) ) {
                // plan is instantiated
                this.#currentPlan = new planClass(this.parent);
                console.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.currentPlan.execute( ...this.predicate );
                    console.log('succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res;
                // or errors are caught so to continue with next plan
                } catch (msg) {
                    console.log(msg);
                }
            }

        }

        // if stopped then quit
        if ( this.stopped ) throw {message : 'Stopped Intention', ...this.predicate};

        // no plans have been found to satisfy the intention
        throw {message : 'No plan satisfied the intention ', ...this.predicate };
    }

}