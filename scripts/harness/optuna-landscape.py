"""
Optuna landscape search for harness hyperparameters.

Tunes:
  - HARNESS_ENRICHMENT_DISCOUNT     (0.1 – 1.0)  enrichment-mined relation confidence multiplier
  - HARNESS_COOCCURRENCE_THRESHOLD  (2 – 6)       co-occurrence count before relation creation
  - HARNESS_PATTERN_CONFIDENCE_SCALE (0.3 – 1.5)  global multiplier on all pattern confidenceBase

Objective: maximize mean RelF1 across selected personas.

Usage:
  python -u scripts/harness/optuna-landscape.py --personas olivia-hassan --trials 30 --cycles 3
  python -u scripts/harness/optuna-landscape.py --personas olivia-hassan,alex-jordan --trials 50
  python -u scripts/harness/optuna-landscape.py --personas olivia-hassan --trials 20 --visualize

Phase 29: TVAL-01
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import optuna

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
HARNESS_SCRIPT = SCRIPT_DIR / "run-adversarial.ts"

# ---------------------------------------------------------------------------
# Objective function
# ---------------------------------------------------------------------------

def make_objective(personas: str, cycles: int, delay_ms: int, api_key: str):
    """Return an Optuna objective that runs the harness with trial params."""

    def objective(trial: optuna.Trial) -> float:
        # Sample hyperparameters
        enrichment_discount = trial.suggest_float(
            "enrichment_discount", 0.1, 1.0, step=0.05,
        )
        cooccurrence_threshold = trial.suggest_int(
            "cooccurrence_threshold", 2, 6,
        )
        pattern_confidence_scale = trial.suggest_float(
            "pattern_confidence_scale", 0.3, 1.5, step=0.05,
        )

        # Build env with tunable knobs
        env = {
            **os.environ,
            "ANTHROPIC_API_KEY": api_key,
            "HARNESS_ENRICHMENT_DISCOUNT": str(enrichment_discount),
            "HARNESS_COOCCURRENCE_THRESHOLD": str(cooccurrence_threshold),
            "HARNESS_PATTERN_CONFIDENCE_SCALE": str(pattern_confidence_scale),
        }

        experiment_name = f"optuna-trial-{trial.number:03d}"

        cmd = [
            "npx", "tsx", str(HARNESS_SCRIPT),
            "--personas", personas,
            "--cycles", str(cycles),
            "--delay-ms", str(delay_ms),
            "--skip-ablation",
            "--skip-report",
            "--experiment", experiment_name,
        ]

        print(f"\n{'='*60}")
        print(f"Trial {trial.number}: "
              f"discount={enrichment_discount:.2f} "
              f"cooc_thresh={cooccurrence_threshold} "
              f"pattern_scale={pattern_confidence_scale:.2f}")
        print(f"{'='*60}")

        try:
            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                timeout=1200,  # 20 min max per trial
                cwd=str(PROJECT_ROOT),
                shell=True,  # Required on Windows to resolve npx
            )
        except subprocess.TimeoutExpired:
            print(f"  Trial {trial.number} TIMEOUT")
            return 0.0

        stdout = result.stdout
        stderr = result.stderr

        if result.returncode not in (0, 1):  # 0=pass, 1=fail-threshold (both valid)
            print(f"  Trial {trial.number} ERROR (rc={result.returncode})")
            if stderr:
                print(f"  stderr: {stderr[:500]}")
            return 0.0

        # Parse RelF1 from the AGGREGATE line in the summary table
        # Format: "AGGREGATE              87%     70%      89%   FAIL"
        agg_match = re.search(
            r"AGGREGATE\s+(\d+)%\s+(\d+)%\s+(\d+)%",
            stdout,
        )

        if not agg_match:
            # Fallback: try to find individual persona final scores
            rel_f1_matches = re.findall(
                r"Final:.*?Rel F1=(\d+\.\d+)%",
                stdout,
            )
            if rel_f1_matches:
                rel_f1 = sum(float(m) for m in rel_f1_matches) / len(rel_f1_matches) / 100.0
            else:
                print(f"  Trial {trial.number}: could not parse RelF1")
                print(f"  stdout tail: {stdout[-500:]}")
                return 0.0
        else:
            rel_f1 = float(agg_match.group(2)) / 100.0

        # Also parse entity F1 and privacy for logging
        ent_f1 = float(agg_match.group(1)) / 100.0 if agg_match else 0.0
        privacy = float(agg_match.group(3)) / 100.0 if agg_match else 0.0

        print(f"  Trial {trial.number} result: RelF1={rel_f1:.1%} EntF1={ent_f1:.1%} Privacy={privacy:.1%}")

        # Store extra metrics as user attributes
        trial.set_user_attr("entity_f1", ent_f1)
        trial.set_user_attr("privacy_score", privacy)

        return rel_f1

    return objective


# ---------------------------------------------------------------------------
# Visualization
# ---------------------------------------------------------------------------

def write_text_summary(study: optuna.Study, output_dir: Path):
    """Write a text summary of the study results (no plotly needed)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / "landscape-summary.txt"

    with open(summary_path, "w") as f:
        f.write(f"Optuna Landscape Search Results\n")
        f.write(f"{'='*60}\n\n")
        f.write(f"Best trial: #{study.best_trial.number}\n")
        f.write(f"Best RelF1: {study.best_value:.1%}\n")
        f.write(f"Best params:\n")
        for k, v in study.best_params.items():
            f.write(f"  {k}: {v}\n")
        f.write(f"\nTotal trials: {len(study.trials)}\n\n")

        f.write(f"Parameter importance:\n")
        try:
            importances = optuna.importance.get_param_importances(study)
            for param, importance in importances.items():
                bar = "█" * int(importance * 40)
                f.write(f"  {param:30s} {bar} {importance:.1%}\n")
        except Exception:
            f.write("  (not enough trials for importance estimation)\n")

        f.write(f"\nAll trials (sorted by RelF1):\n")
        f.write(f"{'Trial':>6} {'RelF1':>7} {'EntF1':>7} {'Priv':>7}  "
                f"{'discount':>9} {'cooc':>5} {'scale':>6}\n")
        f.write(f"{'-'*55}\n")

        sorted_trials = sorted(study.trials, key=lambda t: t.value or 0, reverse=True)
        for t in sorted_trials:
            if t.value is None:
                continue
            ent = t.user_attrs.get("entity_f1", 0)
            priv = t.user_attrs.get("privacy_score", 0)
            p = t.params
            f.write(
                f"{t.number:>6} {t.value:>6.1%} {ent:>6.1%} {priv:>6.1%}  "
                f"{p.get('enrichment_discount', 0):>9.2f} "
                f"{p.get('cooccurrence_threshold', 0):>5} "
                f"{p.get('pattern_confidence_scale', 0):>6.2f}\n"
            )

    print(f"  Saved: {summary_path}")


def write_html_plots(study: optuna.Study, output_dir: Path):
    """Generate interactive HTML visualization plots (requires plotly)."""
    from optuna.visualization import (
        plot_optimization_history,
        plot_param_importances,
        plot_slice,
        plot_contour,
    )

    plots = {
        "optimization_history": plot_optimization_history(study),
        "param_importances": plot_param_importances(study),
        "slice_plot": plot_slice(study),
        "contour_plot": plot_contour(study),
    }

    for name, fig in plots.items():
        html_path = output_dir / f"{name}.html"
        fig.write_html(str(html_path))
        print(f"  Saved: {html_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Optuna landscape search for harness knobs")
    parser.add_argument("--personas", required=True, help="Comma-separated persona names")
    parser.add_argument("--trials", type=int, default=30, help="Number of Optuna trials")
    parser.add_argument("--cycles", type=int, default=3, help="Cycles per persona per trial")
    parser.add_argument("--delay-ms", type=int, default=50, help="API throttle delay")
    parser.add_argument("--visualize", action="store_true", help="Generate HTML plots after search")
    parser.add_argument("--study-name", default="harness-landscape", help="Optuna study name")
    parser.add_argument("--db", default=None, help="SQLite DB path for persistence (default: in-memory)")
    args = parser.parse_args()

    # Load API key
    env_path = PROJECT_ROOT / ".env.local"
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                api_key = line.split("=", 1)[1].strip()
                break
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not found in env or .env.local")
        sys.exit(1)

    # Create study
    storage = f"sqlite:///{args.db}" if args.db else None
    study = optuna.create_study(
        study_name=args.study_name,
        direction="maximize",
        storage=storage,
        load_if_exists=True,
    )

    print(f"Optuna landscape search")
    print(f"  Personas: {args.personas}")
    print(f"  Trials: {args.trials}")
    print(f"  Cycles: {args.cycles}")
    print(f"  Study: {args.study_name}")
    print()

    objective = make_objective(args.personas, args.cycles, args.delay_ms, api_key)
    study.optimize(objective, n_trials=args.trials)

    # Print results
    print(f"\n{'='*60}")
    print(f"SEARCH COMPLETE — {len(study.trials)} trials")
    print(f"{'='*60}")
    print(f"Best RelF1: {study.best_value:.1%}")
    print(f"Best params:")
    for k, v in study.best_params.items():
        print(f"  {k}: {v}")

    # Always write text summary
    output_dir = SCRIPT_DIR / "experiments" / "optuna-results"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Write text summary (always works, no plotly needed)
    write_text_summary(study, output_dir)

    if args.visualize:
        try:
            import plotly  # noqa: F401
            write_html_plots(study, output_dir)
        except ImportError:
            print("\nInstall plotly for HTML plots: pip install plotly")


if __name__ == "__main__":
    main()
