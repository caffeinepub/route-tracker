import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Int "mo:core/Int";
import Char "mo:core/Char";

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

  type Participant = {
    id : Text;
    name : Text;
    var lat : Float;
    var lng : Float;
    var lastUpdated : Int;
  };

  type Session = {
    id : Text;
    adminParticipantId : Text;
    createdAt : Int;
    var participants : [Participant];
  };

  let userRoutes = Map.empty<Principal, [Route]>();
  let sessions = Map.empty<Text, Session>();

  var idCounter : Nat = 0;

  func generateId(prefix : Text) : Text {
    idCounter += 1;
    let charsLen : Nat = 36;
    var result = prefix;
    // Use idCounter * large prime as seed (avoids needing Time->Nat conversion)
    var seed : Nat = idCounter * 2654435761 + 12345;
    var i = 0;
    while (i < 6) {
      let idx = seed % charsLen;
      seed := (seed * 1664525 + 1013904223) % 4294967296;
      let charCode : Nat32 = if (idx < 26) {
        Nat32.fromNat(idx + 65)
      } else {
        Nat32.fromNat(idx - 26 + 48)
      };
      let c = Text.fromChar(Char.fromNat32(charCode));
      result := result # c;
      i += 1;
    };
    result
  };

  public shared func createSession(adminName : Text) : async { sessionId : Text; participantId : Text } {
    let sessionId = generateId("");
    let participantId = generateId("P");
    let now = Time.now();
    let admin : Participant = {
      id = participantId;
      name = adminName;
      var lat = 0.0;
      var lng = 0.0;
      var lastUpdated = now;
    };
    let session : Session = {
      id = sessionId;
      adminParticipantId = participantId;
      createdAt = now;
      var participants = [admin];
    };
    sessions.add(sessionId, session);
    { sessionId = sessionId; participantId = participantId }
  };

  public shared func joinSession(sessionId : Text, participantName : Text) : async ?{ participantId : Text } {
    switch (sessions.get(sessionId)) {
      case (null) { null };
      case (?session) {
        let now = Time.now();
        if (now - session.createdAt > 86_400_000_000_000) {
          sessions.remove(sessionId);
          return null;
        };
        let participantId = generateId("P");
        let p : Participant = {
          id = participantId;
          name = participantName;
          var lat = 0.0;
          var lng = 0.0;
          var lastUpdated = now;
        };
        session.participants := session.participants.concat([p]);
        ?{ participantId = participantId }
      };
    };
  };

  public shared func updateLocation(sessionId : Text, participantId : Text, lat : Float, lng : Float) : async Bool {
    switch (sessions.get(sessionId)) {
      case (null) { false };
      case (?session) {
        let now = Time.now();
        var found = false;
        for (p in session.participants.vals()) {
          if (p.id == participantId) {
            p.lat := lat;
            p.lng := lng;
            p.lastUpdated := now;
            found := true;
          };
        };
        found
      };
    };
  };

  public query func getSessionParticipants(sessionId : Text) : async ?[{ id : Text; name : Text; lat : Float; lng : Float; lastUpdated : Int }] {
    switch (sessions.get(sessionId)) {
      case (null) { null };
      case (?session) {
        let result = session.participants.map(
          func(p : Participant) : { id : Text; name : Text; lat : Float; lng : Float; lastUpdated : Int } {
            { id = p.id; name = p.name; lat = p.lat; lng = p.lng; lastUpdated = p.lastUpdated }
          },
        );
        ?result
      };
    };
  };

  public query func getSession(sessionId : Text) : async ?{ id : Text; adminParticipantId : Text; createdAt : Int } {
    switch (sessions.get(sessionId)) {
      case (null) { null };
      case (?session) {
        ?{ id = session.id; adminParticipantId = session.adminParticipantId; createdAt = session.createdAt }
      };
    };
  };

  public shared func leaveSession(sessionId : Text, participantId : Text) : async Bool {
    switch (sessions.get(sessionId)) {
      case (null) { false };
      case (?session) {
        session.participants := session.participants.filter(func(p : Participant) : Bool { p.id != participantId });
        true
      };
    };
  };

  public shared func endSession(sessionId : Text, participantId : Text) : async Bool {
    switch (sessions.get(sessionId)) {
      case (null) { false };
      case (?session) {
        if (session.adminParticipantId == participantId) {
          sessions.remove(sessionId);
          true
        } else {
          false
        }
      };
    };
  };

  // --- Existing route management ---

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
