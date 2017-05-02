import * as api from "../api";

/**
 * Raw message inserted into the event hub queue
 */
export interface IRawOperationMessage {
    // The user who submitted the message
    userId: string;

    // The client who submitted the message
    clientId: string;

    // The object the message is intended for
    objectId: string;

    // The message that was submitted
    operation: api.IMessage;
}

export interface ISequencedOperationMessage {
    // The object the message is intended for
    objectId: string;

    // The sequenced operation
    operation: api.ISequencedMessage;
}
