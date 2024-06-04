#!/usr/bin/env node
//import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
//import * as pddlClient from "@unitn-asa/pddl-client";

import { configAgent1, configAgent2 } from "./config.js";
import { Agent } from "./src/AgentPeer.js";

const agent_1 = new Agent("agent_1", configAgent1.host, configAgent1.token);
agent_1.intentionLoop();    

const agent_2 = new Agent("agent_2", configAgent2.host, configAgent2.token);
agent_2.intentionLoop();    

while(agent_1.id === undefined){
    await new Promise(r => setTimeout(r, 500));
}

agent_2.teammateId = agent_1.id;


while(agent_2.id === undefined){
    await new Promise(r => setTimeout(r, 500));
}

agent_1.teammateId = agent_2.id;

console.log(`${agent_1.role} ID: ${agent_2.teammateId}, ${agent_2.role} ID: ${agent_1.teammateId}`)

