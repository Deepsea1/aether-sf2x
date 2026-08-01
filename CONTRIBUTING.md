# Contributing to Aether by SF2X

Thanks for your interest in improving Aether! Here's how to contribute.

## 🐛 Reporting Bugs

Use the **Bug Report** template. Include:
- The endpoint you called
- Your request payload (remove any sensitive data)
- The response you got
- What you expected

## ✨ Suggesting Features

Use the **Feature Request** template. Tell us:
- What problem you're trying to solve
- Your proposed solution
- How important it is for your workflow

## 🎮 Breaking the Tribunal

This is the fun one. Use the **Tribunal Breach** template.

If you find a hallucination that the tribunal missed:
1. Submit the prompt, the response, and what was wrong
2. Include the trust score it got vs what it should have gotten
3. If it's a real breach, you earn **Aether Trust Credits**

We use these breaches to train the red-team loop. Every breach makes the tribunal stronger.

## 🔧 Pull Requests

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test: `curl -X POST https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/verifyResponse -H "Content-Type: application/json" -d '{"text": "test"}'`
5. Submit a PR with a clear description

## 📝 Code Style

- TypeScript/JavaScript: 2-space indent, semicolons
- Python: PEP 8
- Markdown: GitHub-flavored, max 100 char lines

## 📄 License

By contributing, you agree your contributions are licensed under MIT.
