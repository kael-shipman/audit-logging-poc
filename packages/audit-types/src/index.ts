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

export interface JsonApiRequestDoc {
  data: JsonApiData;
}

export interface JsonApiResponseDocWithoutErrors {
  data: JsonApiData|Array<JsonApiData>,
  included?: Array<unknown>;
}

export interface JsonApiResponseDocWithErrors {
  errors: Array<JsonApiError>;
}

export type JsonApiResponseDoc = JsonApiResponseDocWithErrors|JsonApiResponseDocWithoutErrors;

export const isWithoutErrors = function(doc: any): doc is JsonApiResponseDocWithoutErrors {
  return typeof doc.data !== "undefined" && typeof doc.errors === "undefined";
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

export type TimelessDataEventAttributes = TimelessViewEvent|TimelessCreationEvent|TimelessDeletionEvent|TimelessChangeEvent;

export type DataEventAttributes = TimelessDataEventAttributes & {
  timestamp: number;
}

export namespace Db {
  export type DataEvent = DataEventAttributes & {
    id: number;
  }
}

export namespace Api {
  export interface DataEvent {
    id: number;
    type: "data-events";
    attributes: DataEventAttributes;
  }
}
