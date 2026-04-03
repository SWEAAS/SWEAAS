Now I want to enforce the full user experience end to end. Firstly, the app should be gated such that new users must complete the onboarding experience, whihc should be full view rathe than nested. users can change their onboarding preferences later in settings. users' defualt organisation will be their username.

Once in, users can create their first project, including prompts, budget and other configurations, switch organisation, etc.  so you must reqire the onboarding experience.
the frontend visuals regarding all the numbers and metrics and app name and hq name, etc. everything should be project-based. so when project is switched, all the locality of the IU updates.

I want evry single number in the frontend, every single view inspected such that all numbers are live and from actual agent data/onboarding data. so in other words, we are no longer serving a static frontend but a dynamic one serving real project state. i DO NOT WANT TO SEE ANY made up numbers but instead the whole site must be fetching real data from the backend, and agents must be doing real work. once you ahve deployed the whole website to prod, I will start testing it.

you must must must explore the whole frontend code and make sure to replace any hardcoded data with live fetched data