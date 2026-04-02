import { Outlet } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F8FE" }}>
      <Sidebar />
      <div style={{ marginLeft: 232 }}>
        <Header />
        <main style={{ padding: "28px 32px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
