#!/usr/bin/env node
//import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
//import * as pddlClient from "@unitn-asa/pddl-client";

import { configSingle } from "./config.js";
import { AgentSingle } from "./src/AgentSingle.js";

const agent = new AgentSingle(configSingle.host, configSingle.token);
agent.intentionLoop();