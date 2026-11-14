---
name: culinary-rag-concierge
description: Builds the LangChain + pgvector Hybrid RAG & SQL Tool-Calling Culinary Concierge that renders interactive table-booking and dish-pairing action cards inside the slide-over drawer.
---
# Generative UI Culinary Concierge Skill
1. **Hybrid Tool Routing (SQL + pgvector):**
   - Equip the LangChain agent with `find_available_tables_sql` (queries live PostgreSQL + Redis locks by time slot, party size, and noise level) and `search_chef_knowledge_rag` (searches allergen matrices, halal/sourcing certificates, and diner reviews in `pgvector`).
2. **Actionable Generative UI Responses:**
   - Alongside streamed markdown explanations and citation pills (`[Chef Allergen Guide §2.1]`), return structured JSON payloads for `recommended_table` and `recommended_dishes`.
   - Render these in the frontend drawer as clickable mini-cards with a 1-click **"Hold Table & Add Pairing"** button that updates the user's active reservation cart immediately.