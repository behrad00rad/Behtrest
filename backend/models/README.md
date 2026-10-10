# Local moderation model

Run `python scripts/setup_image_model.py` from the repository root before enabling moderation or building production containers. It explicitly downloads the pinned NudeNet 3.4.2 wheel (~10.6 MB), verifies its package digest and the extracted 12,150,158-byte model's SHA-256, and preserves its upstream license. Model binaries are ignored by Git but included in the backend Docker build context. No model is downloaded during requests or worker startup.

Source: https://github.com/notAI-tech/NudeNet/tree/v3

Model SHA-256: `c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f`

See NUDENET-LICENSE for the upstream AGPL-3.0 license. Keep this notice and upstream license with deployments.
