import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "./useIsMobile";

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type MobileGeofenceOptions = {
  targetLatitude: number;
  targetLongitude: number;
  radiusMeters: number;
};

type ReadCurrentLocationOptions = {
  forceFresh?: boolean;
};

type GeolocationPermissionState =
  | PermissionState
  | "unsupported"
  | "unknown";

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useMobileGeofence({
  targetLatitude,
  targetLongitude,
  radiusMeters,
}: MobileGeofenceOptions) {
  const isMobile = useIsMobile();
  const watchIdRef = useRef<number | null>(null);
  const isSupported =
    typeof window !== "undefined" && "geolocation" in window.navigator;
  const [permissionState, setPermissionState] =
    useState<GeolocationPermissionState>(isSupported ? "unknown" : "unsupported");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [error, setError] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  const distanceMeters = useMemo(() => {
    if (!coordinates) {
      return null;
    }

    return calculateDistanceMeters(
      coordinates.latitude,
      coordinates.longitude,
      targetLatitude,
      targetLongitude,
    );
  }, [coordinates, targetLatitude, targetLongitude]);

  const isWithinGeofence =
    Boolean(isMobile) &&
    typeof distanceMeters === "number" &&
    distanceMeters <= radiusMeters;

  const readCurrentLocation = useCallback((options: ReadCurrentLocationOptions = {}) => {
    if (!isMobile) {
      setError("This location-gated feature is only available on mobile.");
      return;
    }

    if (!isSupported) {
      setPermissionState("unsupported");
      setError("This browser does not support geolocation.");
      return;
    }

    setIsLocating(true);
    setError("");

    window.navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy:
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : null,
        });
        setPermissionState("granted");
        setIsLocating(false);
      },
      (positionError) => {
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location access was denied. Enable it to use on-site mobile features."
            : "Unable to read your current location right now.",
        );
        if (positionError.code === positionError.PERMISSION_DENIED) {
          setPermissionState("denied");
        }
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: options.forceFresh ? 0 : 30_000,
        timeout: 15_000,
      },
    );
  }, [isMobile, isSupported]);

  useEffect(() => {
    if (!isMobile || !isSupported || !("permissions" in navigator)) {
      return undefined;
    }

    let isActive = true;
    let permissionStatus: PermissionStatus | null = null;

    const updatePermissionState = () => {
      if (isActive && permissionStatus) {
        setPermissionState(permissionStatus.state);
      }
    };

    void navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        permissionStatus = status;
        updatePermissionState();

        if (typeof status.addEventListener === "function") {
          status.addEventListener("change", updatePermissionState);
        }

        if (status.state === "granted") {
          readCurrentLocation({ forceFresh: true });
        }
      })
      .catch(() => {
        if (isActive) {
          setPermissionState("unknown");
        }
      });

    return () => {
      isActive = false;

      if (
        permissionStatus &&
        typeof permissionStatus.removeEventListener === "function"
      ) {
        permissionStatus.removeEventListener("change", updatePermissionState);
      }
    };
  }, [isMobile, isSupported, readCurrentLocation]);

  useEffect(() => {
    if (!isMobile || !isSupported || typeof window === "undefined") {
      return undefined;
    }

    const refreshLocation = () => {
      if (document.visibilityState === "visible" && permissionState !== "denied") {
        readCurrentLocation({ forceFresh: true });
      }
    };

    const handlePageShow = () => {
      if (permissionState !== "denied") {
        readCurrentLocation({ forceFresh: true });
      }
    };

    document.addEventListener("visibilitychange", refreshLocation);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", refreshLocation);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [isMobile, isSupported, permissionState, readCurrentLocation]);

  useEffect(() => {
    if (
      !isMobile ||
      !isSupported ||
      permissionState !== "granted" ||
      typeof window === "undefined"
    ) {
      if (
        watchIdRef.current !== null &&
        typeof window !== "undefined" &&
        "geolocation" in window.navigator
      ) {
        window.navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      return undefined;
    }

    watchIdRef.current = window.navigator.geolocation.watchPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy:
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : null,
        });
      },
      (positionError) => {
        if (positionError.code === positionError.PERMISSION_DENIED) {
          setPermissionState("denied");
          setError(
            "Location access was denied. Enable it to use on-site mobile features.",
          );
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        window.navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isMobile, isSupported, permissionState]);

  return {
    coordinates,
    distanceMeters,
    error,
    isLocating,
    isMobile,
    isSupported,
    isWithinGeofence,
    permissionState,
    radiusMeters,
    requestLocation: readCurrentLocation,
  };
}
