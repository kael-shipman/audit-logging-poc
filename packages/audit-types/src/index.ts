export interface JsonApiData {
  id: string|number;
  type: string;
  attributes?: unknown;
  relationships?: unknown;
}

export interface JsonApiError {
  title: string;
  detail: string;
  status: number;
}

export interface IncomingJsonApiDoc {
  data: JsonApiData;
}

export interface OutgoingJsonApiDocWithoutErrors {
  data: JsonApiData|Array<JsonApiData>,
  included?: Array<unknown>;
}

export interface JsonApiDocWithErrors {
  errors: Array<JsonApiError>;
}

export type JsonApiDoc = JsonApiDocWithErrors|OutgoingJsonApiDocWithoutErrors|IncomingJsonApiDoc;

export interface UserAttributes {
  name: string;
  email: string;
  agreedTos: boolean;
}

export namespace Db {
  export interface User extends UserAttributes {
    id: number;
  }
}

export interface TimelessViewEvent {
  action: "viewed";
  timestamp?: number;
  actorType: string;
  actorId: number|string;
  targetType: string;
  targetId: number|string;
  eventName?: string; // A standard name for the event that can be used to map localized strings to describe the event
}

export interface TimelessCreationEvent {
  action: "created";
  timestamp?: number;
  actorType: string;
  actorId: number|string;
  targetType: string;
  targetId: number|string;
  eventName?: string; // A standard name for the event that can be used to map localized strings to describe the event
}

export interface TimelessDeletionEvent {
  action: "deleted";
  timestamp?: number;
  actorType: string;
  actorId: number|string;
  targetType: string;
  targetId: number|string;
  eventName?: string; // A standard name for the event that can be used to map localized strings to describe the event
}

export interface TimelessChangeEvent {
  action: "changed";
  timestamp?: number;
  actorType: string;
  actorId: number|string;
  targetType: string;
  targetId: number|string;
  fieldName: string;
  prevData: any;
  newData: any;
  eventName?: string; // A standard name for the event that can be used to map localized strings to describe the event
}

export type TimelessDataEvent = TimelessViewEvent|TimelessCreationEvent|TimelessDeletionEvent|TimelessChangeEvent;

export type DataEvent = TimelessDataEvent & {
  timestamp: number;
}
