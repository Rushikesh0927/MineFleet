import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
})
 
async function main() {
  const completion = await openai.chat.completions.create({
    model: "z-ai/glm-5.2",
    messages: [{"role":"user","content":"How do I craft a diamond pickaxe in Minecraft?"}],
    temperature: 1,
    top_p: 1,
    max_tokens: 16384,
      seed: 42,
      
    stream: true
  })
   
  for await (const chunk of completion) {
        process.stdout.write(chunk.choices[0]?.delta?.content || '')
    
  }
  
}

main();
