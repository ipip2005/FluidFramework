import { IClient, IClientJoin, IDocumentMessage, IUser, MessageType } from "@prague/runtime-definitions";
import * as moniker from "moniker";
// tslint:disable-next-line:no-var-requires
const now = require("performance-now");
import * as core from "../../core";
import { IProducer } from "../../utils";

export class KafkaOrdererConnection implements core.IOrdererConnection {
    public static async Create(
        existing: boolean,
        document: core.IDocument,
        producer: IProducer,
        tenantId: string,
        documentId: string,
        socket: core.IWebSocket,
        user: IUser,
        client: IClient): Promise<KafkaOrdererConnection> {

        const clientId = moniker.choose();

        // Create the connection
        const connection = new KafkaOrdererConnection(
            existing,
            document,
            producer,
            tenantId,
            documentId,
            clientId,
            user,
            client);

        // Bind the socket to the channels the connection will send to
        await Promise.all([
            socket.join(`${tenantId}/${documentId}`),
            socket.join(`client#${clientId}`)]);
        return connection;
    }

    public get clientId(): string {
        return this._clientId;
    }

    public get existing(): boolean {
        return this._existing;
    }

    public get parentBranch(): string {
        return this._parentBranch;
    }

    // tslint:disable:variable-name
    private _clientId: string;
    private _existing: boolean;
    private _parentBranch: string;
    // tslint:enable:variable-name

    constructor(
        existing: boolean,
        document: core.IDocument,
        private producer: IProducer,
        private tenantId: string,
        private documentId: string,
        clientId: string,
        private user: IUser,
        private client: IClient) {

        this._clientId = clientId;
        this._existing = existing;
        this._parentBranch = document.parent ? document.parent.documentId : null;

        const clientDetail: IClientJoin = {
            clientId: this.clientId,
            detail: this.client,
        };

        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: clientDetail,
                referenceSequenceNumber: -1,
                traces: [],
                type: MessageType.ClientJoin,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
        };

        this.submitRawOperation(message);
    }

    public order(message: IDocumentMessage): void {
        const rawMessage: core.IRawOperationMessage = {
            clientId: this.clientId,
            documentId: this.documentId,
            operation: message,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
        };

        this.submitRawOperation(rawMessage);
    }

    public disconnect() {
        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: this.clientId,
                referenceSequenceNumber: -1,
                traces: [],
                type: MessageType.ClientLeave,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
        };

        this.submitRawOperation(message);
    }

    private submitRawOperation(message: core.IRawOperationMessage) {
        // Add trace
        const operation = message.operation as any;
        if (operation && operation.traces) {
            operation.traces.push(
                {
                    action: "start",
                    service: "alfred",
                    timestamp: now(),
                });
        }

        this.producer.send(JSON.stringify(message), this.documentId);
    }
}

export class KafkaOrderer implements core.IOrderer {
    public static async Create(
        storage: core.IDocumentStorage,
        producer: IProducer,
        tenantId: string,
        documentId: string): Promise<KafkaOrderer> {

        const details = await storage.getOrCreateDocument(tenantId, documentId);
        return new KafkaOrderer(details, producer, tenantId, documentId);
    }

    private existing: boolean;

    constructor(
        private details: core.IDocumentDetails,
        private producer: IProducer,
        private tenantId: string,
        private documentId: string) {
        this.existing = details.existing;
    }

    public async connect(
        socket: core.IWebSocket,
        user: IUser,
        client: IClient): Promise<core.IOrdererConnection> {

        const connection = KafkaOrdererConnection.Create(
            this.existing,
            this.details.value,
            this.producer,
            this.tenantId,
            this.documentId,
            socket,
            user,
            client);

        // document is now existing regardless of the original value
        this.existing = true;

        return connection;
    }

    public close() {
        return Promise.resolve();
    }
}

export class KafkaOrdererFactory {
    private ordererMap = new Map<string, Promise<core.IOrderer>>();

    constructor(private producer: IProducer, private storage: core.IDocumentStorage) {
    }

    public async create(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const fullId = `${tenantId}/${documentId}`;
        if (!this.ordererMap.has(fullId)) {
            const orderer = KafkaOrderer.Create(this.storage, this.producer, tenantId, documentId);
            this.ordererMap.set(fullId, orderer);
        }

        return this.ordererMap.get(fullId);
    }
}
