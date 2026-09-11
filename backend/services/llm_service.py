import httpx
import logging
import json
from typing import List, Dict, Any, Optional
from config import settings

logger = logging.getLogger("llm_service")

class LLMService:
    def __init__(self):
        self.api_url = settings.LLM_API_URL
        self.timeout = settings.LLM_TIMEOUT

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 1000,
    ) -> str:
        """
        Sends request to WiseAI chat completions endpoint using the specified payload structure:
        {
            "messages": [...],
            "stream": False,
            "chat_template_kwargs": {"enable_thinking": False}
        }
        """
        payload = {
            "messages": messages,
            "stream": False,
            "chat_template_kwargs": {"enable_thinking": settings.ENABLE_THINKING},
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.api_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                return content.strip()
        except Exception as e:
            logger.error(f"Error calling WiseAI LLM endpoint: {e}")
            raise e

    async def structured_completion(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        """
        Requests completion and ensures valid JSON output.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        raw_text = await self.chat_completion(messages)
        
        # Clean markdown codeblocks if returned
        clean_text = raw_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        elif clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()

        try:
            return json.loads(clean_text)
        except json.JSONDecodeError:
            # Try to find JSON substring if extra text was included
            import re
            match = re.search(r'\{.*\}', clean_text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            raise ValueError(f"Failed to parse JSON from LLM: {raw_text}")

llm_service = LLMService()
