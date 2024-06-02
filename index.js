#!/usr/bin/env node
//import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
//import * as pddlClient from "@unitn-asa/pddl-client";

import { configSingle, configMaster, configSlave } from "./config.js";
import { Agent as SingleAgent} from "./src/AgentSingle.js";
import { Agent as MasterAgent} from "./src/AgentMaster.js";
import { Agent as SlaveAgent} from "./src/AgentSlave.js";

const useSingleAgent = process.env.RUN_SINGLE_AGENT === "true";

if(useSingleAgent){
    const agent = new SingleAgent(configSingle.token);
    agent.intentionLoop();    
}else{
    const agentMaster = new MasterAgent(configMaster.token);
    agentMaster.intentionLoop();    
    
    const agentSlave = new SlaveAgent(configSlave.token);
    agentSlave.intentionLoop();    

    while(agentMaster.id === undefined){
        await new Promise(r => setTimeout(r, 500));
    }

    agentSlave.teammateId = agentMaster.id;


    while(agentSlave.id === undefined){
        await new Promise(r => setTimeout(r, 500));
    }

    agentMaster.teammateId = agentSlave.id;

    console.log("MASTER ID: "+agentSlave.teammateId+" SLAVE ID: "+agentMaster.teammateId)
}
