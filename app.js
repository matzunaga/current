(() => {
  "use strict";

  const CITIES = {
    "san-diego": {
      name: "San Diego, California",
      shortName: "San Diego",
      lat: 32.7157,
      lon: -117.1611,
      timezone: "America/Los_Angeles"
    },
    "los-angeles": {
      name: "Los Angeles, California",
      shortName: "Los Angeles",
      lat: 34.0522,
      lon: -118.2437,
      timezone: "America/Los_Angeles"
    },
    "san-francisco": {
      name: "San Francisco, California",
      shortName: "San Francisco",
      lat: 37.7749,
      lon: -122.4194,
      timezone: "America/Los_Angeles"
    },
    "new-york": {
      name: "New York, New York",
      shortName: "New York",
      lat: 40.7128,
      lon: -74.006,
      timezone: "America/New_York"
    },
    "mexico-city": {
      name: "Mexico City, Mexico",
      shortName: "Mexico City",
      lat: 19.4326,
      lon: -99.1332,
      timezone: "America/Mexico_City"
    },
    london: {
      name: "London, United Kingdom",
      shortName: "London",
      lat: 51.5072,
      lon: -0.1276,
      timezone: "Europe/London"
    },
    tokyo: {
      name: "Tokyo, Japan",
      shortName: "Tokyo",
      lat: 35.6762,
      lon: 139.6503,
      timezone: "Asia/Tokyo"
    }
  };

  const DEFAULT_CITY_ID = "san-diego";
  const STORAGE_KEY = "current-city";
  const REFRESH_MS = 15 * 60 * 1000;

  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d", { alpha: true });

  const intro = document.getElementById("intro");
  const reading = document.getElementById("reading");
  const startButton = document.getElementById("start");
  const pauseBtn = document.getElementById("pauseBtn");
  const conditionEl = document.getElementById("condition");
  const detailsEl = document.getElementById("details");
  const statusEl = document.getElementById("status");

  const aboutButton = document.getElementById("aboutButton");
  const closeAbout = document.getElementById("closeAbout");
  const aboutPanel = document.getElementById("aboutPanel");

  const toneToggle = document.getElementById("toneToggle");

  const placeEl = document.getElementById("place");
  const locationButton = document.getElementById("locationButton");
  const locationPanel = document.getElementById("locationPanel");
  const closeLocation = document.getElementById("closeLocation");
  const cityList = document.getElementById("cityList");
  const pageDescription = document.getElementById("pageDescription");

  const savedCityId = localStorage.getItem(STORAGE_KEY);
  const initialCityId = CITIES[savedCityId] ? savedCityId : DEFAULT_CITY_ID;

  const state = {
    cityId: initialCityId,
    city: CITIES[initialCityId],
    running: false,
