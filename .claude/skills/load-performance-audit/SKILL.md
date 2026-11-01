---
name: load-performance-audit
description: Plan and evaluate authorized, budget-bounded UCAS performance, Lighthouse and API load testing.
---
# Workflow

1. Define environment, explicit authorization, expected concurrency, cloud quotas, costs and a stop threshold.
2. Never send synthetic stress traffic to unrelated live systems. Prefer local/staging tests with mock API providers.
3. Measure mobile load and Core Web Vitals where possible: LCP, INP, CLS, memory and file extraction latency.
4. Exercise 10 then 25 then 50 virtual test sessions only when capacity and service limits allow, ending early on errors.
5. Include failure of Supabase/Gemini and intermittent networks; ensure offline functionality remains usable.
6. Distinguish measurement results from targets and recommend capacity/caching changes based on observed evidence.

Deliver: environment, datasets, measurements, failure thresholds and recommendations without invented benchmark numbers.
