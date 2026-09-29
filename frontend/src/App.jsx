import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Welcome from "./app/Welcome.jsx";
import Driver from "./app/Driver.jsx";
import ControlRoom from "./app/ControlRoom.jsx";
import Setup from "./app/Setup.jsx";
import { needsSetup } from "./config.js";

// The installed app has no "same host" to talk to, so until a server address
// is saved every route leads to Setup.
const guard = (el) => (needsSetup() ? <Navigate to="/setup" replace /> : el);

export default function App({ clerkEnabled }) {
  return (
    <Routes>
      <Route path="/" element={guard(<Welcome />)} />
      <Route path="/driver" element={guard(<Driver />)} />
      <Route path="/control" element={guard(<ControlRoom clerkEnabled={clerkEnabled} />)} />
      <Route path="/setup" element={<Setup />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
