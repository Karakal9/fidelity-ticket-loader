import os
import asyncio
import sys
import json
from browser_use import Agent, Browser, ChatAnthropic
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def run_ai_trade(setup_json):
    setup = json.loads(setup_json)
    
    # 1. Initialize Claude
    print("DEBUG: Initializing Claude 3.5 Sonnet...")
    llm = ChatAnthropic(
        model="claude-3-5-sonnet-latest",
        api_key=os.getenv("ANTHROPIC_API_KEY")
    )

    # 2. Connect to your ALREADY OPEN Chrome
    print("DEBUG: Connecting to Chrome on port 9222...")
    browser = Browser(
        cdp_url="http://localhost:9222"
    )
    await browser.start()
    print("DEBUG: Browser connection active!")

    # 3. Define the Trading Task
    ticker = setup.get('ticker')
    quantity = setup.get('quantity')
    price = setup.get('price')
    limit_price = setup.get('limitPrice')
    target = setup.get('target')
    stop_loss = setup.get('stopLoss')
    order_type = setup.get('orderType')

    task = f"""
    Go to Fidelity Trade page: https://digital.fidelity.com/ftgw/digital/trade-equity/index/orderEntry
    
    Wait for the page to load. If a login screen appears, wait for the user to login manually.
    
    Once on the trade page:
    1. Select the account that ends in '...0732' (Individual account).
    2. Enter the symbol '{ticker}' and confirm it.
    3. Select Action 'Buy'.
    4. Change the main 'Order Type' to 'Conditional'.
    5. In the 'Conditional Type' dropdown, select 'One triggers a one cancels the other (OTOCO)'.
    
    Now fill out the 3 orders:
    - Order A (Entry): Set Order Type to '{order_type}'. Quantity to {quantity}. 
      {'Set Stop Price to ' + str(price) + ' and Limit Price to ' + str(limit_price) if order_type == 'Stop Limit' else 'Set Limit Price to ' + str(price)}
    
    - Order B (Take Profit): Set Order Type to 'Limit'. Quantity to {quantity}. Limit Price to {target}. Set Time in Force to 'Good 'til Canceled'.
    
    - Order C (Stop Loss): Set Order Type to 'Stop Loss'. Quantity to {quantity}. Stop Price to {stop_loss}. Set Time in Force to 'Good 'til Canceled'.
    
    STOP at the Preview screen. Do NOT click Place Order.
    """

    print(f"AI Agent (Claude) starting task for {ticker}...")
    
    agent = Agent(
        task=task,
        llm=llm,
        browser=browser
    )

    await agent.run()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ai_trader.py '<setup_json>'")
        sys.exit(1)
        
    asyncio.run(run_ai_trade(sys.argv[1]))
