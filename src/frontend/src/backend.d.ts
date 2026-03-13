import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Coordinate {
    latitude: number;
    longitude: number;
}
export interface Route {
    name: string;
    waypoints: Array<Coordinate>;
    distance: number;
    timestamp: bigint;
}
export interface Participant {
    id: string;
    name: string;
    lat: number;
    lng: number;
    lastUpdated: bigint;
}
export interface SessionInfo {
    id: string;
    adminParticipantId: string;
    createdAt: bigint;
}
export interface backendInterface {
    deleteRoute(index: bigint): Promise<void>;
    getRoutes(): Promise<Array<Route>>;
    saveRoute(route: Route): Promise<void>;
    createSession(adminName: string): Promise<{ sessionId: string; participantId: string }>;
    joinSession(sessionId: string, participantName: string): Promise<Option<{ participantId: string }>>;
    updateLocation(sessionId: string, participantId: string, lat: number, lng: number): Promise<boolean>;
    getSessionParticipants(sessionId: string): Promise<Option<Array<Participant>>>;
    getSession(sessionId: string): Promise<Option<SessionInfo>>;
    leaveSession(sessionId: string, participantId: string): Promise<boolean>;
    endSession(sessionId: string, participantId: string): Promise<boolean>;
}
