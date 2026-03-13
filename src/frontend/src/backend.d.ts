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
export interface backendInterface {
    deleteRoute(index: bigint): Promise<void>;
    getRoutes(): Promise<Array<Route>>;
    saveRoute(route: Route): Promise<void>;
}
