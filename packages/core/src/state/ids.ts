export type ActorId = string;
export type SceneId = string;
export type WidgetInstanceId = string;
export type SectionId = string;
export type GroupId = string;
export type GrantId = string;
export type OperationId = string;

export interface IdGenerator {
	(): string;
}

export interface Clock {
	(): string;
}
