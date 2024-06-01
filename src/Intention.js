import { planLibrary } from "./Plan.js";

/**
 * Intention
 */
export class Intention {

    #desire;

    #current_plan; // Plan currently used for achieving the intention 
    
    #stopped = false; // This is used to stop the intention
    #started = false;

    #parent; // Refers to caller (the agent)

    #predicate;

    constructor ( parent, desire, predicate ) {
        this.#parent = parent;
        this.#desire = desire;
        this.#predicate = predicate;
    }

    get desire() { return this.#desire; }

    get stopped () { return this.#stopped; }

    get parent () { return this.#parent; }

    get predicate () { return this.#predicate; }

    stop() {
        // this.log( 'stop intention', ...this.#predicate );
        this.#stopped = true;
        if (this.#current_plan)
            this.#current_plan.stop();
    }

    /**
     * Using the plan library to achieve an intention
     */
    async achieve () {
        // Cannot start twice
        if (this.#started)
            return this;
        else
            this.#started = true;

        // Trying all plans in the library
        for (const planClass of planLibrary) {

            // if stopped then quit
            if ( this.stopped ) throw {message : 'Stopped Intention', ...this.predicate};

            // if plan is 'statically' applicable
            if ( planClass.isApplicableTo( this.desire ) ) {
                // plan is instantiated
                this.#current_plan = new planClass(this.parent);
                console.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute( ...this.predicate );
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