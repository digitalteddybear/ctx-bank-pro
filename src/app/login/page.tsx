'use client';

import {useEffect, useState, type FormEvent} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {ThemeAwareBrand} from '@/components/ui/theme-aware-brand';

const pageStyle = {
  minHeight: '100vh',
  backgroundColor: 'var(--color-background-body)',
  padding: 'var(--spacing-6)',
};

const contentStyle = {width: '100%', maxWidth: 400};

export default function LoginCardPage() {
  const [email, setEmail] = useState('');
  const [passkey, setPasskey] = useState('');
  const [passkeyConfirmation, setPasskeyConfirmation] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupMode, setSetupMode] = useState<'create' | 'bootstrap'>('create');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    void fetch('/api/session', {cache: 'no-store'})
      .then(async response => {
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (data && typeof data === 'object' && 'loginRequired' in data) {
          setSetupRequired('setupRequired' in data && data.setupRequired === true);
          if ('setupMode' in data && data.setupMode === 'bootstrap') setSetupMode('bootstrap');
        }
      })
      .catch(() => undefined);
  }, []);

  const signIn = async (profile: 'administrator' | 'guest' | 'setup', event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (isLoading) return;
    if (profile === 'setup' && setupMode === 'create' && passkey !== passkeyConfirmation) {
      setError('Passkeys do not match.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(profile === 'guest' ? {profile: 'guest'} : profile === 'setup' ? {profile: 'setup', email, passkey} : {email, password: passkey}),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(result && typeof result === 'object' && 'error' in result ? String(result.error) : 'Sign in failed.');
      }
      window.location.assign('/?view=dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Center axis="both" style={pageStyle}>
      <VStack gap={4} hAlign="center" style={contentStyle}>
        <VStack gap={2} hAlign="center">
          <ThemeAwareBrand width={122} height={36} />
        </VStack>
        <Card padding={8} width="100%">
          <VStack gap={4} hAlign="stretch">
            <VStack gap={1} hAlign="center">
              <Heading level={2}>{setupRequired ? 'Set up CTX Bank' : 'Welcome back'}</Heading>
              <Text type="body" color="secondary" size="sm">{setupRequired ? 'Create the administrator profile for this CTX instance.' : 'Sign in to CTX Bank'}</Text>
            </VStack>
            <form onSubmit={event => void signIn(setupRequired ? 'setup' : 'administrator', event)}>
              <VStack gap={3} hAlign="stretch">
                <TextInput label="Administrator email" isLabelHidden type="email" placeholder="Admin email" value={email} onChange={setEmail} size="lg" />
                <TextInput label={setupRequired ? setupMode === 'bootstrap' ? 'Setup passkey' : 'Create administrator passkey' : 'Administrator passkey'} isLabelHidden type="password" placeholder={setupRequired ? setupMode === 'bootstrap' ? 'Configured setup passkey' : 'Create passkey (12+ characters)' : 'Admin passkey'} value={passkey} onChange={value => {setPasskey(value); setError('');}} size="lg" />
                {setupRequired && setupMode === 'create' && <TextInput label="Confirm administrator passkey" isLabelHidden type="password" placeholder="Confirm passkey" value={passkeyConfirmation} onChange={value => {setPasskeyConfirmation(value); setError('');}} size="lg" />}
                {error && <Text role="alert" color="secondary">{error}</Text>}
                <Button label={setupRequired ? 'Save admin profile' : 'Sign in'} type="submit" variant="primary" size="lg" isLoading={isLoading} isDisabled={!email || !passkey || (setupRequired && setupMode === 'create' && passkeyConfirmation.length < 12)} />
              </VStack>
            </form>
            <Divider label="Or continue with" />
            <Button label="Continue as Guest" variant="secondary" size="lg" isLoading={isLoading} onClick={() => void signIn('guest')} />
            <VStack hAlign="center">
              <Text type="supporting" color="secondary">Guest access is read-only.</Text>
            </VStack>
          </VStack>
        </Card>
        <VStack hAlign="center" width="100%">
          <Text type="supporting" color="secondary" justify="center">
            {setupRequired ? `${setupMode === 'bootstrap' ? 'Use the setup passkey supplied with this CTX deployment.' : 'Your passkey is stored as a one-way hash in CTX persistent configuration.'} Terms & Conditions and Privacy Policy are available from this CTX instance administrator.` : 'By continuing, you agree to the Terms & Conditions and Privacy Policy for this CTX instance.'}
          </Text>
        </VStack>
      </VStack>
    </Center>
  );
}
