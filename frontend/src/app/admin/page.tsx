"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LayoutGrid, Lock, LogOut, RefreshCw, Utensils } from "lucide-react";
import { AdminFloorplanEditor } from "@/components/AdminFloorplanEditor";
import { AdminMenuManager } from "@/components/AdminMenuManager";
import {
  adminLogin,
  adminVerifySession,
  fetchMenuItems,
  fetchTables,
  fetchZones,
} from "@/lib/api";

const ADMIN_TOKEN_KEY = "nocturne_boss_admin_token";

type AdminTab = "menu" | "floorplan";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [bossUser, setBossUser] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("menu");

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!saved) {
      setCheckingSession(false);
      return;
    }

    adminVerifySession(saved)
      .then((res) => {
        setToken(saved);
        setBossUser(res.username);
      })
      .catch(() => {
        window.localStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken(null);
        setBossUser(null);
      })
      .finally(() => setCheckingSession(false));
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);

  const menuQuery = useQuery({
    queryKey: ["menu", "admin"],
    queryFn: () => fetchMenuItems(),
    enabled: Boolean(token),
  });

  const tablesQuery = useQuery({
    queryKey: ["tables", "admin"],
    queryFn: () => fetchTables({ date: todayStr, timeSlot: "20:30" }),
    enabled: Boolean(token),
  });

  const zonesQuery = useQuery({
    queryKey: ["zones", "admin"],
    queryFn: () => fetchZones(todayStr, "20:30"),
    enabled: Boolean(token),
  });

  const handleCatalogChanged = () => {
    queryClient.invalidateQueries();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const res = await adminLogin({
        username: username.trim(),
        password,
      });
      window.localStorage.setItem(ADMIN_TOKEN_KEY, res.access_token);
      setToken(res.access_token);
      setBossUser(res.username);
      setPassword("");
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : "Invalid Boss credentials."
      );
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSignOut = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setBossUser(null);
    setUsername("");
    setPassword("");
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center px-6">
        <div className="border border-brass/25 bg-charcoal px-8 py-6 text-center">
          <p className="font-sans text-xs uppercase tracking-[0.22em] text-brass">
            Verifying Nocturne Boss Credentials...
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-obsidian text-cream flex flex-col justify-between px-5 py-10">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-sans text-xs uppercase tracking-[0.18em] text-sand hover:text-brass transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Nocturne</span>
          </Link>
        </div>

        <div className="max-w-md w-full mx-auto border border-brass/35 bg-charcoal/95 p-8 shadow-card my-12">
          <div className="flex items-center gap-3 mb-6">
            <img
              src="/web-app-manifest-192x192.png"
              alt="Nocturne emblem"
              className="w-10 h-10 rounded-full border border-brass/35 object-contain mix-blend-lighten"
            />
            <div>
              <div className="font-sans text-[10px] uppercase tracking-[0.24em] text-brass">
                Proprietor Access
              </div>
              <h1 className="font-display text-2xl text-cream tracking-[0.14em] uppercase">
                Nocturne Admin
              </h1>
            </div>
          </div>

          <p className="text-xs text-sand/85 leading-relaxed mb-6">
            Authorized access for culinary catalog management, table inventory additions,
            SVG floorplan layout editing, and perspective photography updates.
          </p>

          {loginError && (
            <div className="mb-4 px-3.5 py-2.5 border border-ember/55 bg-ember/15 text-xs text-cream">
              {loginError}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label
                htmlFor="boss-username"
                className="block font-sans text-[11px] uppercase tracking-[0.16em] text-brass mb-1.5"
              >
                Boss Username
              </label>
              <input
                id="boss-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter proprietor username"
                className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/30 text-sm text-cream placeholder:text-sand/40 focus:outline-none focus:border-brass"
              />
            </div>

            <div>
              <label
                htmlFor="boss-password"
                className="block font-sans text-[11px] uppercase tracking-[0.16em] text-brass mb-1.5"
              >
                Boss Password
              </label>
              <input
                id="boss-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter proprietor password"
                className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/30 text-sm text-cream placeholder:text-sand/40 focus:outline-none focus:border-brass"
              />
            </div>

            <button
              type="submit"
              disabled={loginBusy}
              className="w-full inline-flex items-center justify-center gap-2 py-3 bg-brass hover:bg-brass-light text-obsidian font-sans text-xs font-semibold uppercase tracking-[0.2em] transition-colors disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{loginBusy ? "Authenticating..." : "Unlock Admin Studio"}</span>
            </button>
          </form>
        </div>

        <div className="max-w-7xl w-full mx-auto text-center text-[11px] font-sans uppercase tracking-[0.16em] text-sand/60">
          Nocturne Dhaka &middot; Level 14 Operations Console
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-obsidian text-cream pb-20">
      {/* Top Executive Console Header */}
      <header className="border-b border-brass/25 bg-charcoal/90 px-5 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src="/web-app-manifest-192x192.png"
                alt="Nocturne emblem"
                className="w-9 h-9 rounded-full border border-brass/35 object-contain mix-blend-lighten"
              />
              <div>
                <div className="font-display text-lg tracking-[0.24em] text-cream uppercase group-hover:text-brass transition-colors">
                  Nocturne
                </div>
                <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-brass">
                  Boss Studio &middot; {bossUser || "Proprietor"}
                </div>
              </div>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCatalogChanged}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-brass/30 bg-obsidian hover:border-brass text-xs font-sans uppercase tracking-[0.14em] text-sand hover:text-cream transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-brass" />
              <span>Sync Live</span>
            </button>

            <Link
              href="/reserve"
              className="inline-flex items-center px-3.5 py-2 border border-brass/30 bg-obsidian hover:border-brass text-xs font-sans uppercase tracking-[0.14em] text-cream transition-colors"
            >
              View Guest Floorplan
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-ember/40 bg-obsidian hover:bg-ember/15 text-xs font-sans uppercase tracking-[0.14em] text-ember transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-8 space-y-6">
        {/* Section Switcher */}
        <div className="flex flex-wrap items-center gap-3 border-b border-brass/20 pb-4">
          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={`inline-flex items-center gap-2 px-5 py-2.5 border text-xs font-sans uppercase tracking-[0.18em] transition-colors ${
              activeTab === "menu"
                ? "border-brass bg-brass text-obsidian font-semibold"
                : "border-brass/30 bg-charcoal text-cream hover:border-brass"
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Menu Studio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("floorplan")}
            className={`inline-flex items-center gap-2 px-5 py-2.5 border text-xs font-sans uppercase tracking-[0.18em] transition-colors ${
              activeTab === "floorplan"
                ? "border-brass bg-brass text-obsidian font-semibold"
                : "border-brass/30 bg-charcoal text-cream hover:border-brass"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Floorplan Outline &amp; Table Images</span>
          </button>
        </div>

        {(menuQuery.isError || tablesQuery.isError || zonesQuery.isError) && (
          <div className="border border-ember/50 bg-ember/10 px-4 py-3 text-xs text-cream">
            {(menuQuery.error as Error)?.message ||
              (tablesQuery.error as Error)?.message ||
              (zonesQuery.error as Error)?.message ||
              "Unable to fetch live restaurant catalog from backend."}
          </div>
        )}

        {activeTab === "menu" ? (
          menuQuery.isLoading ? (
            <div className="border border-brass/20 bg-charcoal/70 p-10 text-center text-xs uppercase tracking-[0.18em] text-sand">
              Loading Culinary Catalog...
            </div>
          ) : (
            <AdminMenuManager
              token={token}
              menuItems={menuQuery.data || []}
              onCatalogChanged={handleCatalogChanged}
            />
          )
        ) : tablesQuery.isLoading || zonesQuery.isLoading ? (
          <div className="border border-brass/20 bg-charcoal/70 p-10 text-center text-xs uppercase tracking-[0.18em] text-sand">
            Loading Architectural Floorplan...
          </div>
        ) : (
          <AdminFloorplanEditor
            token={token}
            tables={tablesQuery.data || []}
            zones={zonesQuery.data || []}
            onCatalogChanged={handleCatalogChanged}
          />
        )}
      </div>
    </main>
  );
}
