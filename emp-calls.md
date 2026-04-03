# Employee Calls

Here is the tiny version:

- We have one big phone line for internal video calls.
- We can put different faces on that phone line.
- The CTO is the saved default face.
- Any employee can also use the same phone line.
- The backend tells Tavus who it should pretend to be for that call.

## What Changed

- The frontend now tells the backend which employee you picked, not just which face you picked.
- The org chart sends `agent_id` and `replica_id` into the call page.
- The call page keeps employee calls temporary, so it does **not** accidentally overwrite your saved CTO.
- The CTO page still saves the CTO face when you are really changing the CTO.
- The backend now builds call context with the employee's:
  - name
  - role
  - department
  - hierarchy level

## Why

Before, the backend mostly knew the face.

That was a problem because:

- two employees can share the same face
- the backend still needs to know if the call is for a CTO, manager, or specialist

Now the backend knows both:

- the face to show
- the employee to act like

## How It Works

Think about it like dress-up:

- `replica_id` is the costume face
- the shared Tavus internal persona is the brain
- the backend context is the note that says:
  - "You are Raj"
  - "You are in engineering"
  - "You are a manager"
  - "Talk about this topic"

So we can reuse one Tavus brain, but make it act like different people by giving it better instructions.

## Files

- `frontend/src/views/OrgChartView.tsx`
  - sends the employee into the call flow
- `frontend/src/views/CTOCallView.tsx`
  - separates saved CTO mode from temporary employee-call mode
- `frontend/src/api/client.ts`
  - sends the richer call target payload
- `backend/app/schemas/communication_schema.py`
  - accepts the richer internal call target
- `backend/app/services/communication_service.py`
  - builds the employee-aware Tavus context

## Important Rule

- CTO call = default saved internal call target
- employee call = temporary target
- one shared internal Tavus persona can power both

That means we do **not** need one different Tavus persona for every employee.
