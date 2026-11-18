import type { NextConfig } from "next";
// Validates every environment variable when the server (or the build) starts.
import "./src/env";

const config: NextConfig = {};

export default config;
