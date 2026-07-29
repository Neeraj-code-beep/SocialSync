import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import GradientButton from '../components/GradientButton';
import { Input } from '../components/Input';
import Navbar from '../components/layout/Navbar';
import { usePageTitle } from '../hooks/usePageTitle';

const Login = () => {
  usePageTitle('Login — CaptionAI');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    const result = await login(data.username, data.password);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-20 bg-[#FBFAF7] relative">
      <Navbar />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <GlassCard hover={false} className="p-8 bg-white border border-[#E7E4DE] shadow-sm">
          <div className="text-center mb-8">
            <img src="/apple-touch-icon.png" alt="CaptionAI" className="w-12 h-12 rounded-xl mx-auto mb-3 object-contain shrink-0" />
            <h2 className="text-2xl font-bold text-[#171717]">Welcome back</h2>
            <p className="text-sm text-[#66645F] mt-1">Log in to your CaptionAI workspace</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              id="login-username"
              label="Username or Email"
              icon={Mail}
              placeholder="alex_creator"
              error={errors.username?.message}
              {...register('username', { required: 'Username or email is required' })}
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#171717]">
                  Password
                </span>
              </div>

              <Input
                id="login-password"
                type="password"
                icon={Lock}
                placeholder="••••••••"
                error={errors.password?.message}
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 4, message: 'Password must be at least 4 characters' },
                })}
              />
            </div>

            <GradientButton
              type="submit"
              disabled={isSubmitting}
              fullWidth
              size="lg"
              variant="primary"
              icon={isSubmitting ? UserCheck : ArrowRight}
              className="mt-6"
            >
              {isSubmitting ? 'Authenticating...' : 'Continue'}
            </GradientButton>
          </form>

          <div className="mt-8 text-center text-xs text-[#66645F] border-t border-[#E7E4DE] pt-6">
            Don't have an account yet?{' '}
            <Link to="/signup" className="text-[#171717] font-semibold hover:underline">
              Create account
            </Link>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
};

export default Login;
