import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";

actor {
  type Coordinate = {
    latitude : Float;
    longitude : Float;
  };

  type Route = {
    name : Text;
    timestamp : Int;
    distance : Float;
    waypoints : [Coordinate];
  };

  let userRoutes = Map.empty<Principal, [Route]>();

  public shared ({ caller }) func saveRoute(route : Route) : async () {
    let currentRoutes = switch (userRoutes.get(caller)) {
      case (null) { [] };
      case (?routes) { routes };
    };

    let updatedRoutes = currentRoutes.concat([route]);
    userRoutes.add(caller, updatedRoutes);
  };

  public query ({ caller }) func getRoutes() : async [Route] {
    switch (userRoutes.get(caller)) {
      case (null) { [] };
      case (?routes) { routes };
    };
  };

  public shared ({ caller }) func deleteRoute(index : Nat) : async () {
    switch (userRoutes.get(caller)) {
      case (null) { Runtime.trap("No routes found for user.") };
      case (?routes) {
        if (index >= routes.size()) {
          Runtime.trap("Invalid index. Cannot remove route at index " # index.toText());
        };
        userRoutes.add(
          caller,
          Array.tabulate<Route>(
            routes.size() - 1,
            func(i) {
              if (i < index) { routes[i] } else { routes[i + 1] };
            },
          ),
        );
      };
    };
  };
};
