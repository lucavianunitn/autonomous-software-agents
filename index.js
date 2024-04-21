#!/usr/bin/env node
//import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
//import * as pddlClient from "@unitn-asa/pddl-client";

import { default as config } from "./config.js";
import { Controller } from "./src/Controller.js";

const controller = new Controller(config.host);

controller.addAgent(config.token);
controller.startAgent(0);