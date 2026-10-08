import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Icon, type IconName } from './Icon';

/** Stands in for a page that needs an account (Messages, your profile) when browsing as a guest. */
export function SignInPrompt({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const { requireSignIn } = useStore();
  return (
    <div className="page">
      <div className="card signin-prompt">
        <span className="prompt-icon"><Icon name={icon} size={26} /></span>
        <h2>{title}</h2>
        <p>{text}</p>
        <button className="btn primary" onClick={() => requireSignIn(text)}>
          Sign in or create an account
        </button>
        <Link to="/settings" className="settings-link">
          <Icon name="settings" size={15} /> Settings
        </Link>
      </div>
    </div>
  );
}
