#!/usr/bin/env node
//import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
//import * as pddlClient from "@unitn-asa/pddl-client";

import { default as config } from "./config.js";
import { Agent } from "./src/Agent.js";

const agent = new Agent(config.host, config.token);
agent.start();