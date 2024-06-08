#!/usr/bin/env node
//import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
//import * as pddlClient from "@unitn-asa/pddl-client";

import { configAgent1, configAgent2 } from "./config.js";
import { AgentTeam } from "./src/AgentTeam.js";

const agent_1 = new AgentTeam(configAgent1.host, configAgent1.token);
agent_1.intentionLoop();

const agent_2 = new AgentTeam(configAgent2.host, configAgent2.token);
agent_2.intentionLoop();

while(agent_1.id === undefined){
    await new Promise(r => setTimeout(r, 500));
    console.log(agent_1.id);
}

agent_2.teammateId = agent_1.id;


while(agent_2.id === undefined){
    await new Promise(r => setTimeout(r, 500));
}

agent_1.teammateId = agent_2.id;

console.log(`${agent_1.role} ID: ${agent_2.teammateId}, ${agent_2.role} ID: ${agent_1.teammateId}`)

