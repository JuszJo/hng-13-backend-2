import crypto from "crypto";
import { SystemPrompt } from "./ai.service.js";
import { OR_API_KEY } from "../config/openrouter.config.js";

function computeSHA256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const StringService = {
  analyzeString(value) {
    const length = value.length;

    const normalized = value.toLowerCase().replace(/\s/g, '');
    const is_palindrome = normalized === normalized.split('').reverse().join('');

    const unique_characters = new Set(value).size;

    const word_count = value.trim().split(/\s+/).filter(word => word.length > 0).length;

    const sha256_hash = computeSHA256(value);

    const character_frequency_map = {};

    for (const char of value) {
      if (char === ' ') continue;

      character_frequency_map[char] = (character_frequency_map[char] || 0) + 1;
    }

    return {
      length,
      is_palindrome,
      unique_characters,
      word_count,
      sha256_hash,
      character_frequency_map
    };
  },

  applyFilters(stringData, filters) {
    let results = Array.from(stringData.values());

    // console.log(results, filters);

    if (filters.is_palindrome !== undefined) {
      results = results.filter(item => item.properties.is_palindrome === filters.is_palindrome);
    }

    if (filters.min_length !== undefined) {
      results = results.filter(item => item.properties.length >= filters.min_length);
    }

    if (filters.max_length !== undefined) {
      results = results.filter(item => item.properties.length <= filters.max_length);
    }

    if (filters.word_count !== undefined) {
      results = results.filter(item => item.properties.word_count === filters.word_count);
    }

    if (filters.contains_character) {
      results = results.filter(item => item.value.includes(filters.contains_character));
    }

    return results;
  },

  async filterNLP(value) {
    const body = {
      model: "tngtech/deepseek-r1t2-chimera:free",
      messages: [
        {
          role: "system",
          content: SystemPrompt.prompt
        },
        {
          role: "user",
          content: value
        }
      ]
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OR_API_KEY}`,
        "Content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Error getting response from model. Status: ${response.status}, ${response.statusText}`)
    }

    const data = await response.json();

    const content = data.choices[0].message.content;

    return content;
  },

}

export default StringService;