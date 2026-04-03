import app.services.onboarding_service as onboarding_service
from app.schemas.onboarding_schema import DepartmentSizes, TeamOnboardingConfigRequest, TeamPersonaAssignment


def test_team_config_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(onboarding_service, "_CACHE_DIR", tmp_path)
    service = onboarding_service.OnboardingService()

    response = service.save_team_config(
        "org-123",
        TeamOnboardingConfigRequest(
            company_size=120,
            overall_budget_usd=9000,
            department_sizes=DepartmentSizes(engineering=5, marketing=2, product=2, support=2),
            cto_assignment=TeamPersonaAssignment(
                agent_id="cto-01",
                replica_id="r-cto",
                replica_name="Luna",
                model_name="phoenix-4",
            ),
            assignments=[
                TeamPersonaAssignment(
                    agent_id="eng-mgr-01",
                    replica_id="r-eng",
                    replica_name="Charlie",
                    model_name="phoenix-4",
                )
            ],
        ),
    )

    assert response.completed is True
    assert response.cto_assignment is not None
    assert response.cto_assignment.replica_name == "Luna"

    loaded = service.get_team_config("org-123")
    assert loaded.company_size == 120
    assert loaded.assignments[0].replica_name == "Charlie"


def test_patch_cto_allows_duplicate_replica_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(onboarding_service, "_CACHE_DIR", tmp_path)
    service = onboarding_service.OnboardingService()

    service.save_team_config(
        "org-123",
        TeamOnboardingConfigRequest(
            company_size=120,
            overall_budget_usd=9000,
            department_sizes=DepartmentSizes(engineering=5, marketing=2, product=2, support=2),
            cto_assignment=None,
            assignments=[
                TeamPersonaAssignment(
                    agent_id="eng-mgr-01",
                    replica_id="r-eng",
                    replica_name="Charlie",
                    model_name="phoenix-4",
                )
            ],
        ),
    )

    result = service.patch_cto_assignment(
        "org-123",
        onboarding_service.CTOAssignmentPatchRequest(
            cto_assignment=TeamPersonaAssignment(
                agent_id="cto-01",
                replica_id="r-eng",
                replica_name="Charlie A",
                model_name="phoenix-4",
            )
        )
    )

    assert result.cto_assignment is not None
    assert result.cto_assignment.replica_id == "r-eng"
    assert result.cto_assignment.replica_name == "Charlie A"


def test_summarize_replica_usage_counts_all_saved_orgs(tmp_path, monkeypatch):
    monkeypatch.setattr(onboarding_service, "_CACHE_DIR", tmp_path)
    service = onboarding_service.OnboardingService()

    service.save_team_config(
        "org-123",
        TeamOnboardingConfigRequest(
            company_size=120,
            overall_budget_usd=9000,
            department_sizes=DepartmentSizes(engineering=5, marketing=2, product=2, support=2),
            cto_assignment=TeamPersonaAssignment(
                agent_id="cto-01",
                replica_id="r-shared",
                replica_name="Luna",
                model_name="phoenix-4",
            ),
            assignments=[
                TeamPersonaAssignment(
                    agent_id="eng-mgr-01",
                    replica_id="r-eng",
                    replica_name="Charlie",
                    model_name="phoenix-4",
                )
            ],
        ),
    )

    service.save_team_config(
        "org-456",
        TeamOnboardingConfigRequest(
            company_size=60,
            overall_budget_usd=4000,
            department_sizes=DepartmentSizes(engineering=3, marketing=1, product=1, support=1),
            cto_assignment=None,
            assignments=[
                TeamPersonaAssignment(
                    agent_id="prd-mgr-01",
                    replica_id="r-shared",
                    replica_name="Luna",
                    model_name="phoenix-4",
                ),
            ],
        ),
    )

    service.save_team_config(
        "org-789",
        TeamOnboardingConfigRequest(
            company_size=40,
            overall_budget_usd=3000,
            department_sizes=DepartmentSizes(engineering=2, marketing=1, product=1, support=1),
            cto_assignment=None,
            assignments=[
                TeamPersonaAssignment(
                    agent_id="sup-mgr-01",
                    replica_id="r-shared",
                    replica_name="Luna",
                    model_name="phoenix-4",
                ),
            ],
        ),
    )

    summary = service.summarize_replica_usage("r-shared")

    assert summary["organization_count"] == 3
    assert summary["cto_assignment_count"] == 1
    assert summary["team_assignment_count"] == 2
    assert summary["total_assignment_count"] == 3
