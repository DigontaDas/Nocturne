---
name: editorial-motion-hospitality
description: Implements the "Midnight Rooftop & Brass" luxury hospitality aesthetic using Cormorant Garamond + Plus Jakarta Sans + JetBrains Mono, Lenis smooth scroll, GSAP reveals, and Framer Motion shared-layout transitions.
---
# Editorial Motion & Luxury Hospitality UI Skill
1. **Strict Visual Rules:**
   - Use `#0E0D0C` background, `#171513` surfaces, `#D4AF37` champagne brass highlights, and `#FAF7F2` warm cream text.
   - NEVER use generic blue/purple SaaS gradients or white admin tables.
   - Wrap the root layout in `<ReactLenis root>` for smooth inertia scrolling.
2. **Signature Dish Card Physics:**
   - Top-down dish images must gently rotate (`whileHover={{ rotate: 10, scale: 1.06 }}`) with spring physics (`stiffness: 220, damping: 18`) when the card is hovered.
   - Use Framer Motion `layoutId` when opening the Dish Customizer Modal so the plate smoothly morphs into the customization studio.