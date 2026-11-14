"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { TrayItem } from "@/types/nocturne";

export interface HeldTableState {
  tableCode: string;
  reservationDate: string;
  timeSlot: string;
  expiresAt: string;
}

interface ReservationContextValue {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedSlot: string;
  setSelectedSlot: (slot: string) => void;
  partySize: number;
  setPartySize: (size: number) => void;
  heldTable: HeldTableState | null;
  setHeldTable: (hold: HeldTableState | null) => void;
  trayItems: TrayItem[];
  addTrayItem: (item: TrayItem) => void;
  updateTrayQuantity: (key: string, delta: number) => void;
  removeTrayItem: (key: string) => void;
  clearTray: () => void;
  conciergeOpen: boolean;
  setConciergeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pendingConciergePrompt: string | null;
  setPendingConciergePrompt: React.Dispatch<React.SetStateAction<string | null>>;
  openConciergeWithPrompt: (prompt?: string) => void;
}

const ReservationContext = createContext<ReservationContextValue | null>(null);

function getDefaultDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ReservationProvider({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<string>(getDefaultDate);
  const [selectedSlot, setSelectedSlot] = useState<string>("20:30");
  const [partySize, setPartySize] = useState<number>(2);
  const [heldTable, setHeldTable] = useState<HeldTableState | null>(null);
  const [trayItems, setTrayItems] = useState<TrayItem[]>([]);
  const [conciergeOpen, setConciergeOpen] = useState<boolean>(false);
  const [pendingConciergePrompt, setPendingConciergePrompt] = useState<string | null>(null);

  const openConciergeWithPrompt = (prompt?: string) => {
    if (prompt && prompt.trim().length > 0) {
      setPendingConciergePrompt(prompt.trim());
    }
    setConciergeOpen(true);
  };

  // Global Ctrl+J / Cmd+J shortcut for the AI Culinary Concierge Drawer
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setConciergeOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const addTrayItem = (incoming: TrayItem) => {
    setTrayItems((prev) => {
      const existing = prev.find((item) => item.key === incoming.key);
      if (existing) {
        return prev.map((item) =>
          item.key === incoming.key
            ? { ...item, quantity: item.quantity + incoming.quantity }
            : item
        );
      }
      return [...prev, incoming];
    });
  };

  const updateTrayQuantity = (key: string, delta: number) => {
    setTrayItems((prev) =>
      prev
        .map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeTrayItem = (key: string) => {
    setTrayItems((prev) => prev.filter((item) => item.key !== key));
  };

  const clearTray = () => setTrayItems([]);

  return (
    <ReservationContext.Provider
      value={{
        selectedDate,
        setSelectedDate,
        selectedSlot,
        setSelectedSlot,
        partySize,
        setPartySize,
        heldTable,
        setHeldTable,
        trayItems,
        addTrayItem,
        updateTrayQuantity,
        removeTrayItem,
        clearTray,
        conciergeOpen,
        setConciergeOpen,
        pendingConciergePrompt,
        setPendingConciergePrompt,
        openConciergeWithPrompt,
      }}
    >
      {children}
    </ReservationContext.Provider>
  );
}

export function useReservationContext() {
  const ctx = useContext(ReservationContext);
  if (!ctx) {
    throw new Error("useReservationContext must be used inside ReservationProvider");
  }
  return ctx;
}
