#!/usr/bin/env node
//import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
//import * as pddlClient from "@unitn-asa/pddl-client";

import { configSingle, configMaster, configSlave } from "./config.js";
import { Agent as SingleAgent} from "./src/AgentSingle.js";


const agent = new SingleAgent(configSingle.token);
agent.intentionLoop();    
