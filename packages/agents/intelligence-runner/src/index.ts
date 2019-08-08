/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentRouter,
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@prague/component-core-interfaces";
import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { IntelRunner, ITokenConfig } from "./intelRunner";

export class TextAnalyzer implements IComponentRouter, IComponentRunnable {

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    constructor(
        private readonly sharedString: Sequence.SharedString,
        private readonly insightsMap: ISharedMap,
        private readonly config: ITokenConfig) {}

    public async run() {
        if (this.config === undefined || this.config.key === undefined || this.config.key.length === 0) {
            return Promise.reject("No intel key provided.");
        }
        const intelRunner = new IntelRunner(this.sharedString, this.insightsMap, this.config);
        return intelRunner.start();
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }
}
