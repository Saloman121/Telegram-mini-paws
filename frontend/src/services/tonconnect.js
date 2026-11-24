import { useCallback, useEffect, useState } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { api } from './api';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Asks the server for a ton_proof payload and, once a wallet connects with a
// signed proof, sends it to the server. The SERVER verifies ownership.
export function useWalletSync(onSynced) {
  const [ui] = useTonConnectUI();
  useEffect(() => {
    let off;
    (async () => {
      try {
        const { payload } = await api.proofPayload();
        ui.setConnectRequestParameters({ state: 'ready', value: { tonProof: payload } });
      } catch { ui.setConnectRequestParameters(null); }
      off = ui.onStatusChange(async (w) => {
        const proof = w?.connectItems?.tonProof?.proof;
        if (!w || !proof) return;
        try {
          await api.walletConnect({
            address: w.account.address, public_key: w.account.publicKey,
            network: w.account.chain, state_init: w.account.walletStateInit, proof,
          });
          onSynced?.();
        } catch (e) { console.error('wallet connect failed', e); }
      });
    })();
    return () => off?.();
  }, [ui]); // eslint-disable-line
}

// purpose: 'wallet_verification' | 'auto_tap' | 'buy_token'
// Status only becomes "confirmed" when the BACKEND confirms the on-chain transaction.
export function usePayment(onConfirmed) {
  const [ui] = useTonConnectUI();
  const wallet = useTonWallet();
  const [state, setState] = useState({ status: 'idle', error: null });

  const pay = useCallback(async (purpose, params = {}) => {
    if (!wallet) { ui.openModal(); return; }
    setState({ status: 'pending', error: null });
    try {
      const intent = await api.paymentIntent({ purpose, ...params });
      const sent = await ui.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: intent.address, amount: intent.amount_nano, payload: intent.payload }],
      });
      await api.paymentVerify({ intent_id: intent.intent_id, boc: sent.boc });
      for (let i = 0; i < 30; i++) {
        await sleep(4000);
        const s = await api.paymentStatus(intent.intent_id);
        if (s.status === 'confirmed') { setState({ status: 'confirmed', error: null }); onConfirmed?.(); return; }
        if (s.status === 'failed') throw new Error(s.reason || 'Payment failed');
      }
      setState({ status: 'pending', error: 'Still waiting for blockchain confirmation. Check back shortly.' });
    } catch (e) {
      setState({ status: 'failed', error: e.message });
    }
  }, [wallet, ui, onConfirmed]);

  return { ...state, pay, connected: !!wallet };
}
