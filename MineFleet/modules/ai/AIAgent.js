const { OpenAI } = require('openai');

class AIAgent {
  constructor(botManager, botId, username) {
    this.botManager = botManager;
    this.botId = botId;
    this.username = username;
    
    // Initialize OpenAI client pointing to NVIDIA NIM API
    const apiKey = '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'; // Hardcoded per user request
    if (!apiKey) {
      console.warn(`[AIAgent] WARNING: NVIDIA_API_KEY is not set. AI will not function for ${username}.`);
    }

    this.openai = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: apiKey,
    });

    this.model = 'z-ai/glm-5.2';
    
    // Tools available to the AI
    this.tools = [
      {
        type: 'function',
        function: {
          name: 'goto',
          description: 'Moves the bot to specific x, y, z coordinates.',
          parameters: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' }
            },
            required: ['x', 'y', 'z']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'follow',
          description: 'Follows a specific player.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'The name of the player to follow' }
            },
            required: ['target']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'mine',
          description: 'Mines a block at specific coordinates.',
          parameters: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' }
            },
            required: ['x', 'y', 'z']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'stop',
          description: 'Stops the current action (e.g. stops moving or following).',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'attack',
          description: 'Attacks a specific target entity or type of entity (e.g. \"hostile\").',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'The name of the entity or \"hostile\"' }
            },
            required: ['target']
          }
        }
      }
    ];
  }

  /**
   * Process a chat message directed at this bot.
   */
  async handleMessage(sender, message, bot) {
    if (!process.env.NVIDIA_API_KEY) {
      bot.chat(`Sorry ${sender}, my AI brain is missing an API key.`);
      return;
    }

    try {
      console.log(`[AIAgent][${this.username}] Processing request from ${sender}: "${message}"`);
      
      const systemPrompt = `You are a Minecraft Java Edition bot named ${this.username}. 
Your master is ${sender}. 
You are an absolute expert on Minecraft Java Edition mechanics. You possess complete knowledge about blocks, items, crafting recipes, biomes, and entities.
Here is a quick reference of Minecraft Java Edition knowledge:
- Crafting: Players use a 2x2 grid in their inventory or a 3x3 grid on a Crafting Table. For example, to make a Crafting Table, you need 4 Wooden Planks. To make a Pickaxe, you need 3 ingots/gems on top and 2 sticks in the middle.
- Blocks: The world is made of blocks. Utility blocks include Furnaces (for smelting with fuel like Coal), Chests (for storage), and Redstone Dust (for circuitry).
- Entities: Mobs can be Passive (Pigs, Cows, Sheep), Neutral (Endermen, Wolves), or Hostile (Zombies, Skeletons, Creepers). Creepers explode when near you!
- Dimensions: Overworld, Nether, and The End.
You are able to execute tasks in the world such as moving to coordinates, following players, mining blocks, attacking entities, and stopping your current task. 
Use the provided tools to execute the user's requests. If a request is conversational, just reply in character, showing off your Minecraft knowledge when appropriate. If a request requires an action, use the tool. If the action succeeds, say something like "On my way!" or "Mining now!". Keep your text responses very short, game-appropriate, and under 150 characters.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        tools: this.tools,
        tool_choice: 'auto',
        max_tokens: 150,
      });

      const responseMessage = response.choices[0].message;

      // Check if AI wants to call a tool
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          
          console.log(`[AIAgent][${this.username}] Executing tool ${functionName} with args:`, functionArgs);
          
          let synthMsg = '';
          switch (functionName) {
            case 'goto':
            case 'mine':
              synthMsg = `!${functionName} ${functionArgs.x} ${functionArgs.y} ${functionArgs.z}`;
              break;
            case 'follow':
            case 'attack':
              synthMsg = `!${functionName} ${functionArgs.target}`;
              break;
            case 'stop':
              synthMsg = `!stop`;
              break;
          }
          
          if (synthMsg) {
             this.botManager.commandManager.execute(sender, synthMsg, bot);
          }
        }
        
        // Also send any text response the AI provided along with the tool call
        if (responseMessage.content) {
          bot.chat(responseMessage.content);
        } else {
          bot.chat(`Affirmative, ${sender}.`);
        }
      } else if (responseMessage.content) {
        bot.chat(responseMessage.content);
      }
      
    } catch (error) {
      console.error(`[AIAgent][${this.username}] Error processing message:`, error);
      bot.chat(`Sorry, I encountered an error in my AI matrix.`);
    }
  }
}

module.exports = AIAgent;
