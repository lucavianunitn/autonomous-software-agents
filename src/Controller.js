import { Agent } from "./Agent.js";

export class Controller {

    #serverUrl;

    #agents;

    constructor(serverUrl) {
        this.#serverUrl = serverUrl;
        this.#agents = [];
    }

    addAgent(agentToken) {

        let agents = this.#agents;
        let isNew = true;

        for (let i = 0; i < this.#agents.length; i++){

            let agent = this.#agents[i];
            let token = agent.getAgentToken();

            if (token === agentToken) {
                isNew = false;
                return false;
            }

        }

        agents.push(new Agent(this.#serverUrl, agentToken));

        return true;

    }

    startAgent(agentIndex) {

        this.#agents[agentIndex].testLoop();

    }

}